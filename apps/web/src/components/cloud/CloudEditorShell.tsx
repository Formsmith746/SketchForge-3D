"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import CloudHomeDashboard from "@/components/cloud/CloudHomeDashboard";
import CloudOpeningScreen from "@/components/cloud/CloudOpeningScreen";
import {
  CloudApiError,
  cloudFetch,
  cloudUploadBytes,
  getCloudStatus,
  type CloudProjectSummary,
  type CloudStatus,
  type CloudUploadProgress,
} from "@/lib/cloudApi";
import { editorHistoryEntry, hydrateEditorHistoryState, type EditorHistoryEntry } from "@/lib/editorHistory";
import {
  readFileAsArrayBufferWithProgress,
  waitForImportProgressPaint,
  type FileImportProgress,
} from "@/lib/fileImportProgress";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { attachProjectAsset, dedupeProjectAssets, projectAssetFromBytes, sourceFormatForFileName } from "@/lib/projectAssets";
import { exportSkfProject, importSkfProject, SKF_MEDIA_TYPE } from "@/lib/skfProject";
import type { GridSize, ProjectAsset, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

type CloudView = "dashboard" | "editor";

type ProjectDocument = {
  formatVersion: 1;
  shapes: WorkplaneShape[];
  workspace: WorkplaneWorkspaceSettings | null;
  snap: GridSize | null;
  history: EditorHistoryEntry[];
  historyIndex: number;
  assets: ProjectAsset[];
  placementElevation: number;
};

type LegacyProjectDocument = {
  formatVersion?: number;
  shapes?: WorkplaneShape[];
  workspace?: WorkplaneWorkspaceSettings | null;
  snap?: GridSize | null;
  history?: WorkplaneShape[][] | EditorHistoryEntry[];
  historyIndex?: number;
};

type ProjectListResponse = { projects: CloudProjectSummary[]; readOnly: boolean };
type SaveConflict = { projectId: string; projectName: string };

const EMPTY_PROJECT: ProjectDocument = {
  formatVersion: 1,
  shapes: [],
  workspace: null,
  snap: null,
  history: [editorHistoryEntry([], [])],
  historyIndex: 0,
  assets: [],
  placementElevation: 0,
};
const AUTOSAVE_INTERVAL_MS = 30_000;
const MAX_PROJECT_BYTES = 8 * 1024 * 1024;

const SketchForgeEditor = dynamic(
  () => import("@/components/SketchForgeEditor").then((module) => module.SketchForgeEditor),
  { ssr: false, loading: () => <CloudOpeningScreen label="Loading editor" detail="Preparing your 3D workspace" /> },
);

function projectNameFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Imported design";
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function recoveryFileName(projectName: string) {
  const safeName = projectName.trim().replace(/[^a-z0-9_.-]+/gi, "-") || "sketchforge-project";
  return `${safeName}-recovery.skf`;
}

async function downloadRecovery(projectName: string, document: ProjectDocument) {
  const bytes = await exportSkfProject({
    projectName,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    shapes: document.shapes,
    history: document.history,
    historyIndex: document.historyIndex,
    assets: document.assets,
    workspace: document.workspace ?? DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: document.snap ?? DEFAULT_SNAP_GRID,
    placementElevation: document.placementElevation,
  });
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: SKF_MEDIA_TYPE });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = recoveryFileName(projectName);
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeProjectDocument(document: LegacyProjectDocument | ProjectDocument): ProjectDocument {
  const shapes = Array.isArray(document.shapes) ? document.shapes : [];
  const rawHistory = Array.isArray(document.history) ? document.history : [];
  const migratedHistory = rawHistory.map((entry) => Array.isArray(entry)
    ? editorHistoryEntry(entry, [])
    : entry as EditorHistoryEntry);
  const history = hydrateEditorHistoryState(shapes, migratedHistory, document.historyIndex);
  return {
    formatVersion: 1,
    shapes,
    workspace: document.workspace ?? null,
    snap: document.snap ?? null,
    history: history.entries,
    historyIndex: history.index,
    assets: dedupeProjectAssets("assets" in document && Array.isArray(document.assets) ? document.assets : []),
    placementElevation: "placementElevation" in document && Number.isFinite(document.placementElevation) ? Number(document.placementElevation) : 0,
  };
}

async function projectDocumentFromResponse(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || response.headers.get("X-SketchForge-Project-Format") === "skf") {
    const restored = await importSkfProject(bytes);
    return normalizeProjectDocument({
      formatVersion: 1,
      shapes: restored.shapes,
      workspace: restored.workspace,
      snap: restored.snapGrid,
      history: restored.history,
      historyIndex: restored.historyIndex,
      assets: restored.assets,
      placementElevation: restored.placementElevation,
    });
  }
  try {
    return normalizeProjectDocument(JSON.parse(new TextDecoder().decode(bytes)) as LegacyProjectDocument);
  } catch {
    throw new Error("The stored project is not a valid SketchForge project.");
  }
}

async function encodeCloudProject(project: CloudProjectSummary, document: ProjectDocument, modifiedAt = Date.now()) {
  return exportSkfProject({
    projectId: project.id,
    projectName: project.name,
    createdAt: project.createdAt * 1000,
    modifiedAt,
    shapes: document.shapes,
    history: document.history,
    historyIndex: document.historyIndex,
    assets: document.assets,
    workspace: document.workspace ?? DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: document.snap ?? DEFAULT_SNAP_GRID,
    placementElevation: document.placementElevation,
  });
}

export default function CloudEditorShell({ initialStatus }: { initialStatus?: CloudStatus } = {}) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CloudView>("dashboard");
  const [status, setStatus] = useState<CloudStatus | null>(initialStatus ?? null);
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<CloudProjectSummary | null>(null);
  const [document, setDocument] = useState<ProjectDocument>(EMPTY_PROJECT);
  const [projectRevision, setProjectRevision] = useState(0);
  const [saveState, setSaveState] = useState("Saved");
  const [dashboardNotice, setDashboardNotice] = useState("");
  const [importProgress, setImportProgress] = useState<FileImportProgress | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const documentRef = useRef<ProjectDocument>(EMPTY_PROJECT);
  const projectRef = useRef<CloudProjectSummary | null>(null);
  const dirtyRef = useRef(false);
  const changeRevisionRef = useRef(0);
  const savingRef = useRef(false);
  const savePendingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const projectOperationRef = useRef(false);
  const projectLoadAbortRef = useRef<AbortController | null>(null);
  const projectLoadRunRef = useRef(0);
  const projectSnapshotFlushRef = useRef<(() => void) | null>(null);
  const projectThumbnailCaptureRef = useRef<(() => Promise<string | null>) | null>(null);
  const thumbnailUploadRef = useRef(new Map<string, number>());
  const saveConflictRef = useRef<SaveConflict | null>(null);

  const setCurrentConflict = useCallback((conflict: SaveConflict | null) => {
    saveConflictRef.current = conflict;
    setSaveConflict(conflict);
  }, []);

  const activateProject = useCallback((project: CloudProjectSummary, nextDocument: ProjectDocument) => {
    const normalizedDocument = normalizeProjectDocument(nextDocument);
    documentRef.current = normalizedDocument;
    projectRef.current = project;
    dirtyRef.current = false;
    changeRevisionRef.current = 0;
    savePendingRef.current = false;
    setDocument(normalizedDocument);
    setActiveProject(project);
    setProjectRevision((value) => value + 1);
    setSaveState("Saved");
    setCurrentConflict(null);
    setView("editor");
  }, [setCurrentConflict]);

  const loadProject = useCallback(async (project: CloudProjectSummary, options?: { force?: boolean }) => {
    if (projectOperationRef.current && !options?.force) return;
    projectOperationRef.current = true;
    setProjectBusy(true);
    setDashboardNotice("");
    projectLoadAbortRef.current?.abort();
    const controller = new AbortController();
    projectLoadAbortRef.current = controller;
    const runId = projectLoadRunRef.current + 1;
    projectLoadRunRef.current = runId;
    try {
      const response = await fetch(`/api/cloud/projects/${project.id}`, { credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error("Could not load the cloud project.");
      const nextDocument = await projectDocumentFromResponse(response);
      if (runId !== projectLoadRunRef.current) return;
      const responseVersion = Number(response.headers.get("X-SketchForge-Project-Version"));
      const loadedProject = Number.isInteger(responseVersion) && responseVersion > 0
        ? { ...project, version: responseVersion }
        : project;
      setProjects((items) => items.map((item) => item.id === loadedProject.id ? { ...item, version: loadedProject.version } : item));
      activateProject(loadedProject, nextDocument);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Could not load the cloud project.";
      setDashboardNotice(message);
      throw error;
    } finally {
      if (runId === projectLoadRunRef.current) {
        projectOperationRef.current = false;
        setProjectBusy(false);
      }
    }
  }, [activateProject]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const account = initialStatus ?? await getCloudStatus();
        if (!account.legal.accepted) {
          window.location.replace("/cloud/subscribe");
          return;
        }
        if (!account.entitlement.canOpenEditor) {
          window.location.replace(account.entitlement.route);
          return;
        }
        const result = await cloudFetch<ProjectListResponse>("/api/cloud/projects");
        if (cancelled) return;
        setStatus(account);
        setProjects(result.projects);
      } catch {
        if (!cancelled) window.location.replace("/cloud/subscribe");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialStatus]);

  const captureAndUploadThumbnail = useCallback(async (projectId: string, savedVersion: number, savedRevision: number) => {
    if (thumbnailUploadRef.current.get(projectId) === savedVersion) return;
    thumbnailUploadRef.current.set(projectId, savedVersion);
    try {
      const capture = projectThumbnailCaptureRef.current;
      if (!capture) return;
      const image = await capture();
      const currentProject = projectRef.current;
      if (!image || !currentProject || currentProject.id !== projectId || currentProject.version !== savedVersion) return;
      if (dirtyRef.current || changeRevisionRef.current !== savedRevision) return;
      const result = await cloudFetch<{ version: number; sizeBytes: number }>(`/api/cloud/projects/${projectId}/thumbnail`, {
        method: "PUT",
        body: JSON.stringify({ dataUrl: image, expectedVersion: savedVersion }),
      });
      setProjects((items) => items.map((item) => item.id === projectId ? { ...item, thumbnailVersion: result.version } : item));
      if (projectRef.current?.id === projectId && projectRef.current.version === savedVersion) {
        const updated = { ...projectRef.current, thumbnailVersion: result.version };
        projectRef.current = updated;
        setActiveProject(updated);
      }
    } catch {
      if (thumbnailUploadRef.current.get(projectId) === savedVersion) thumbnailUploadRef.current.delete(projectId);
      setDashboardNotice("The project was saved, but its preview could not be updated.");
    }
  }, []);

  const saveNow = useCallback((onUploadProgress?: (progress: CloudUploadProgress) => void): Promise<boolean> => {
    projectSnapshotFlushRef.current?.();
    const project = projectRef.current;
    if (!project || !dirtyRef.current) return Promise.resolve(true);
    if (saveConflictRef.current?.projectId === project.id) return Promise.resolve(false);
    if (savePromiseRef.current) {
      savePendingRef.current = true;
      return savePromiseRef.current;
    }
    const revisionAtStart = changeRevisionRef.current;
    const sourceDocument = documentRef.current;
    const modifiedAt = Date.now();
    let submittedBytes: Uint8Array | null = null;
    savingRef.current = true;
    savePendingRef.current = false;
    setSaveState("Saving…");
    const request = (async () => {
      try {
        submittedBytes = await exportSkfProject({
          projectId: project.id,
          projectName: project.name,
          createdAt: project.createdAt * 1000,
          modifiedAt,
          shapes: sourceDocument.shapes,
          history: sourceDocument.history,
          historyIndex: sourceDocument.historyIndex,
          assets: sourceDocument.assets,
          workspace: sourceDocument.workspace ?? DEFAULT_WORKPLANE_WORKSPACE,
          snapGrid: sourceDocument.snap ?? DEFAULT_SNAP_GRID,
          placementElevation: sourceDocument.placementElevation,
        });
        if (submittedBytes.byteLength > MAX_PROJECT_BYTES) throw new Error("A cloud project may not exceed 8 MB.");
        const result = await cloudUploadBytes<{ version: number; sizeBytes: number }>(`/api/cloud/projects/${project.id}`, submittedBytes, {
          expectedVersion: project.version,
          onProgress: onUploadProgress,
        });
        const currentProject = projectRef.current;
        if (!currentProject || currentProject.id !== project.id) return false;
        const updated = {
          ...currentProject,
          version: result.version,
          sizeBytes: result.sizeBytes,
          updatedAt: Math.floor(Date.now() / 1000),
        };
        projectRef.current = updated;
        setActiveProject(updated);
        setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
        if (changeRevisionRef.current === revisionAtStart) {
          dirtyRef.current = false;
          setSaveState("Saved");
          setCurrentConflict(null);
          void captureAndUploadThumbnail(project.id, result.version, revisionAtStart);
        } else {
          setSaveState("Unsaved changes");
        }
        return true;
      } catch (error) {
        if (submittedBytes && (!(error instanceof CloudApiError) || error.code === "PROJECT_VERSION_CONFLICT" || error.status >= 500)) {
          try {
            const response = await fetch(`/api/cloud/projects/${project.id}`, { credentials: "same-origin", cache: "no-store" });
            if (response.ok) {
              const remoteBytes = new Uint8Array(await response.arrayBuffer());
              const remoteVersion = Number(response.headers.get("X-SketchForge-Project-Version"));
              if (
                Number.isSafeInteger(remoteVersion)
                && remoteVersion > project.version
                && bytesEqual(remoteBytes, submittedBytes)
              ) {
                const currentProject = projectRef.current;
                if (!currentProject || currentProject.id !== project.id) return false;
                const updated = {
                  ...currentProject,
                  version: remoteVersion,
                  sizeBytes: submittedBytes.byteLength,
                  updatedAt: Math.floor(Date.now() / 1000),
                };
                projectRef.current = updated;
                setActiveProject(updated);
                setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
                if (changeRevisionRef.current === revisionAtStart) {
                  dirtyRef.current = false;
                  setSaveState("Saved");
                  setCurrentConflict(null);
                  void captureAndUploadThumbnail(project.id, remoteVersion, revisionAtStart);
                } else {
                  setSaveState("Unsaved changes");
                }
                return true;
              }
            }
          } catch {
            // Keep the local document dirty; the normal retry/conflict path remains available.
          }
        }
        if (error instanceof CloudApiError && error.code === "PROJECT_VERSION_CONFLICT") {
          const conflict = { projectId: project.id, projectName: project.name };
          setCurrentConflict(conflict);
          setSaveState("Save conflict");
          return false;
        }
        setSaveState(error instanceof Error ? error.message : "Save failed");
        return false;
      } finally {
        savingRef.current = false;
        savePromiseRef.current = null;
        if (savePendingRef.current && dirtyRef.current) {
          savePendingRef.current = false;
          window.setTimeout(() => void saveNow(), 0);
        }
      }
    })();
    savePromiseRef.current = request;
    return request;
  }, [captureAndUploadThumbnail, setCurrentConflict]);

  const markUnsaved = useCallback(() => {
    dirtyRef.current = true;
    changeRevisionRef.current += 1;
    queueMicrotask(() => setSaveState(saveConflictRef.current ? "Save conflict" : "Unsaved changes"));
  }, []);

  const updateSnapshot = useCallback(({
    shapes,
    history,
    historyIndex,
    assets,
  }: {
    projectId: string;
    shapes: WorkplaneShape[];
    history: EditorHistoryEntry[];
    historyIndex: number;
    assets: ProjectAsset[];
  }) => {
    documentRef.current = { ...documentRef.current, shapes, history, historyIndex, assets };
    if (!dirtyRef.current) markUnsaved();
  }, [markUnsaved]);

  const updateWorkspace = useCallback(({ workspace, snap, placementElevation }: { projectId: string; workspace: WorkplaneWorkspaceSettings; snap: GridSize; placementElevation?: number }) => {
    documentRef.current = {
      ...documentRef.current,
      workspace,
      snap,
      placementElevation: Number.isFinite(placementElevation) ? Number(placementElevation) : documentRef.current.placementElevation,
    };
    markUnsaved();
  }, [markUnsaved]);

  useEffect(() => {
    const autosaveInterval = window.setInterval(() => {
      if (dirtyRef.current && !savingRef.current) void saveNow();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(autosaveInterval);
  }, [saveNow]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      projectSnapshotFlushRef.current?.();
      if (!dirtyRef.current && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);

  useEffect(() => () => projectLoadAbortRef.current?.abort(), []);

  const flushSave = useCallback(async (onUploadProgress?: (progress: CloudUploadProgress) => void) => {
    while (dirtyRef.current) {
      const saved = await saveNow(onUploadProgress);
      if (!saved) return false;
    }
    return true;
  }, [saveNow]);

  const createProject = async () => {
    if (projectOperationRef.current) return;
    projectOperationRef.current = true;
    setProjectBusy(true);
    setDashboardNotice("");
    try {
      const created = await cloudFetch<{ project: CloudProjectSummary }>("/api/cloud/projects", {
        method: "POST",
        body: JSON.stringify({ name: "Untitled project" }),
      });
      const initialDocument = normalizeProjectDocument(EMPTY_PROJECT);
      setProjects((items) => [created.project, ...items]);
      activateProject(created.project, initialDocument);
    } catch (error) {
      setDashboardNotice(error instanceof Error ? error.message : "Could not create a cloud project.");
    } finally {
      projectOperationRef.current = false;
      setProjectBusy(false);
    }
  };

  const importProject = async (file: File, onExternalProgress?: (progress: FileImportProgress) => void) => {
    if (projectOperationRef.current) return;
    projectOperationRef.current = true;
    setProjectBusy(true);
    let createdProject: CloudProjectSummary | null = null;
    const reportProgress = (phase: string, percent: number) => {
      const progress = { fileName: file.name, phase, percent };
      setImportProgress(progress);
      onExternalProgress?.(progress);
    };
    setDashboardNotice("");
    reportProgress("Reading file", 2);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "skf") {
        const source = await readFileAsArrayBufferWithProgress(file, (percent) => reportProgress("Reading SketchForge project", percent), { endPercent: 45 });
        reportProgress("Validating project and assets", 58);
        await waitForImportProgressPaint();
        const restored = await importSkfProject(source);
        const importedDocument = normalizeProjectDocument({
          formatVersion: 1,
          shapes: restored.shapes,
          workspace: restored.workspace,
          snap: restored.snapGrid,
          history: restored.history,
          historyIndex: restored.historyIndex,
          assets: restored.assets,
          placementElevation: restored.placementElevation,
        });
        const created = await cloudFetch<{ project: CloudProjectSummary }>("/api/cloud/projects", {
          method: "POST",
          body: JSON.stringify({ name: restored.projectName || projectNameFromFileName(file.name) }),
        });
        createdProject = created.project;
        const bytes = await encodeCloudProject(created.project, importedDocument);
        if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error("This SketchForge project exceeds the 8 MB cloud-project limit.");
        const saved = await cloudUploadBytes<{ version: number; sizeBytes: number }>(`/api/cloud/projects/${created.project.id}`, bytes, {
          expectedVersion: created.project.version,
          onProgress: ({ percent }) => reportProgress("Uploading to SketchForge Cloud", percent),
        });
        const importedProject = { ...created.project, version: saved.version, sizeBytes: saved.sizeBytes, updatedAt: Math.floor(Date.now() / 1000) };
        setProjects((items) => [importedProject, ...items]);
        activateProject(importedProject, importedDocument);
        reportProgress("Import complete", 100);
        return;
      }
      const isSvg = extension === "svg" || file.type === "image/svg+xml";
      const isStep = extension === "step" || extension === "stp";
      let shape: WorkplaneShape | null = null;
      let sourceBytes: Uint8Array | null = null;
      const sourceFormat = sourceFormatForFileName(file.name) ?? (isSvg ? "svg" : null);
      if (isSvg) {
        const source = await readFileAsArrayBufferWithProgress(file, (percent) => reportProgress("Reading SVG", percent), { endPercent: 55 });
        sourceBytes = new Uint8Array(source);
        reportProgress("Building SVG geometry", 68);
        await waitForImportProgressPaint();
        const editorModule = await import("@/components/SketchForgeEditor");
        shape = editorModule.importedShapeFromSvg(file.name, new TextDecoder().decode(sourceBytes));
      } else if (extension === "stl") {
        const source = await readFileAsArrayBufferWithProgress(
          file,
          (percent) => reportProgress("Reading STL", percent),
          { endPercent: 55 },
        );
        reportProgress("Building STL geometry", 68);
        await waitForImportProgressPaint();
        sourceBytes = new Uint8Array(source);
        const editorModule = await import("@/components/SketchForgeEditor");
        shape = editorModule.importedShapeFromStl(file.name, source);
      } else if (isStep) {
        const source = await readFileAsArrayBufferWithProgress(
          file,
          (percent) => reportProgress("Reading STEP", percent),
          { endPercent: 48 },
        );
        reportProgress("Loading STEP engine", 58);
        await waitForImportProgressPaint();
        const stepModule = await import("@/lib/stepImport");
        reportProgress("Building STEP geometry", 70);
        await waitForImportProgressPaint();
        sourceBytes = new Uint8Array(source);
        shape = await stepModule.importedShapeFromStep(file.name, source);
      }
      if (!shape || !sourceBytes || !sourceFormat) throw new Error("Choose an SKF, STL, STEP, or SVG file.");

      const asset = await projectAssetFromBytes(file.name, sourceFormat, sourceBytes, file.type);
      shape = attachProjectAsset(shape, asset.id);

      reportProgress("Preparing cloud project", 78);
      const importedDocument: ProjectDocument = {
        formatVersion: 1,
        shapes: [shape],
        workspace: DEFAULT_WORKPLANE_WORKSPACE,
        snap: DEFAULT_SNAP_GRID,
        history: [editorHistoryEntry([shape], [shape.id])],
        historyIndex: 0,
        assets: [asset],
        placementElevation: 0,
      };

      reportProgress("Creating cloud project", 84);
      const created = await cloudFetch<{ project: CloudProjectSummary }>("/api/cloud/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectNameFromFileName(file.name) }),
      });
      createdProject = created.project;
      const bytes = await encodeCloudProject(created.project, importedDocument);
      if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error("This imported project exceeds the 8 MB cloud-project limit.");
      reportProgress("Uploading to SketchForge Cloud", 0);
      const saved = await cloudUploadBytes<{ version: number; sizeBytes: number }>(`/api/cloud/projects/${created.project.id}`, bytes, {
        expectedVersion: created.project.version,
        onProgress: ({ percent }) => reportProgress("Uploading to SketchForge Cloud", percent),
      });
      const importedProject = {
        ...created.project,
        version: saved.version,
        sizeBytes: saved.sizeBytes,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      setProjects((items) => [importedProject, ...items]);
      reportProgress("Import complete", 100);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
      activateProject(importedProject, importedDocument);
      setDashboardNotice("");
    } catch (error) {
      let cleanupMessage = "";
      if (createdProject) {
        reportProgress("Cleaning up incomplete import", 96);
        try {
          await cloudFetch<{ ok: true }>(`/api/cloud/projects/${createdProject.id}`, { method: "DELETE" });
        } catch {
          setProjects((items) => items.some((item) => item.id === createdProject?.id) ? items : [createdProject as CloudProjectSummary, ...items]);
          cleanupMessage = " The empty placeholder could not be cleaned up and remains in Projects.";
        }
      }
      const message = `${error instanceof Error ? error.message : "Could not import the project."}${cleanupMessage}`;
      setDashboardNotice(message);
      throw new Error(message);
    } finally {
      projectOperationRef.current = false;
      setProjectBusy(false);
      setImportProgress(null);
    }
  };

  const renameProject = async (project: CloudProjectSummary, name: string) => {
    if (projectOperationRef.current) return;
    projectOperationRef.current = true;
    setProjectBusy(true);
    try {
      const result = await cloudFetch<{ name: string }>(`/api/cloud/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      const updated = { ...project, name: result.name };
      setProjects((items) => items.map((item) => item.id === project.id ? updated : item));
      if (projectRef.current?.id === project.id) {
        projectRef.current = updated;
        setActiveProject(updated);
        markUnsaved();
      }
    } catch (error) {
      setDashboardNotice(error instanceof Error ? error.message : "Could not rename the project.");
      throw error;
    } finally {
      projectOperationRef.current = false;
      setProjectBusy(false);
    }
  };

  const removeProject = async (project: CloudProjectSummary) => {
    if (projectOperationRef.current) return;
    projectOperationRef.current = true;
    setProjectBusy(true);
    try {
      const result = await cloudFetch<{ ok: true; databaseDeleted: true; objectsDeleted: true }>(
        `/api/cloud/projects/${project.id}`,
        { method: "DELETE" },
      );
      if (!result.databaseDeleted || !result.objectsDeleted) {
        throw new Error("The server did not confirm complete project deletion.");
      }
      setProjects((items) => items.filter((item) => item.id !== project.id));
      setDashboardNotice(`“${project.name}” was permanently deleted from Cloud storage.`);
      if (projectRef.current?.id === project.id) {
        projectRef.current = null;
        documentRef.current = EMPTY_PROJECT;
        setActiveProject(null);
        setDocument(EMPTY_PROJECT);
      }
    } catch (error) {
      setDashboardNotice(error instanceof Error ? error.message : "Could not delete the project.");
      throw error;
    } finally {
      projectOperationRef.current = false;
      setProjectBusy(false);
    }
  };

  const reloadRemoteProject = async () => {
    const project = projectRef.current;
    if (!project || recoveryBusy) return;
    setRecoveryBusy(true);
    try {
      await loadProject(project, { force: true });
    } catch {
      // loadProject already surfaces a safe message.
    } finally {
      setRecoveryBusy(false);
    }
  };

  const saveLocalAsCopy = async () => {
    const sourceProject = projectRef.current;
    if (!sourceProject || recoveryBusy) return;
    projectSnapshotFlushRef.current?.();
    const localDocument = normalizeProjectDocument(documentRef.current);
    setRecoveryBusy(true);
    let createdProject: CloudProjectSummary | null = null;
    try {
      const created = await cloudFetch<{ project: CloudProjectSummary }>("/api/cloud/projects", {
        method: "POST",
        body: JSON.stringify({ name: `${sourceProject.name} (recovered)` }),
      });
      createdProject = created.project;
      const bytes = await encodeCloudProject(created.project, localDocument);
      if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error("The recovery copy exceeds the 8 MB cloud-project limit.");
      const saved = await cloudUploadBytes<{ version: number; sizeBytes: number }>(`/api/cloud/projects/${created.project.id}`, bytes, {
        expectedVersion: created.project.version,
      });
      const recoveredProject = {
        ...created.project,
        version: saved.version,
        sizeBytes: saved.sizeBytes,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      setProjects((items) => [recoveredProject, ...items]);
      activateProject(recoveredProject, localDocument);
      setDashboardNotice("Your local work was saved as a separate recovery project.");
    } catch (error) {
      if (createdProject) {
        try {
          await cloudFetch<{ ok: true }>(`/api/cloud/projects/${createdProject.id}`, { method: "DELETE" });
        } catch {
          setProjects((items) => items.some((item) => item.id === createdProject?.id) ? items : [createdProject as CloudProjectSummary, ...items]);
        }
      }
      setDashboardNotice(error instanceof Error ? error.message : "Could not save the recovery copy.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const returnHome = () => {
    void flushSave().then((saved) => {
      if (saved) setView("dashboard");
    });
  };

  const registerProjectSnapshotFlush = useCallback((flush: (() => void) | null) => {
    projectSnapshotFlushRef.current = flush;
  }, []);

  const registerProjectThumbnailCapture = useCallback((capture: (() => Promise<string | null>) | null) => {
    projectThumbnailCaptureRef.current = capture;
  }, []);

  if (loading || !status) {
    return <CloudOpeningScreen detail="Loading your projects" />;
  }

  if (view === "dashboard" || !activeProject) {
    return (
      <CloudHomeDashboard
        projectBusy={projectBusy}
        importProgress={importProgress}
        notice={dashboardNotice}
        projects={projects}
        status={status}
        onContinueProject={() => {
          const latest = [...projects].sort((left, right) => right.updatedAt - left.updatedAt)[0];
          if (latest) void loadProject(latest).catch(() => undefined);
        }}
        onCreateProject={() => void createProject()}
        onDeleteProject={removeProject}
        onImportProject={importProject}
        onOpenProject={loadProject}
        onRenameProject={renameProject}
        onStatusChange={setStatus}
      />
    );
  }

  return (
    <main className="cloud-editor-shell">
      <SketchForgeEditor
        initialAssets={document.assets}
        initialShapes={document.shapes}
        initialHistory={document.history}
        initialHistoryIndex={document.historyIndex}
        initialPlacementElevation={document.placementElevation}
        initialSnap={document.snap ?? DEFAULT_SNAP_GRID}
        initialWorkspace={document.workspace ?? DEFAULT_WORKPLANE_WORKSPACE}
        onHome={returnHome}
        onOpenSkfProjectFile={importProject}
        onSave={flushSave}
        onProjectDirty={markUnsaved}
        onProjectSnapshotChange={updateSnapshot}
        onProjectSnapshotFlushReady={registerProjectSnapshotFlush}
        onProjectThumbnailCaptureReady={registerProjectThumbnailCapture}
        onProjectWorkspaceChange={updateWorkspace}
        projectId={activeProject.id}
        projectName={activeProject.name}
        projectCreatedAt={activeProject.createdAt * 1000}
        projectModifiedAt={activeProject.updatedAt * 1000}
        projectRevision={projectRevision}
        saveState={saveState}
      />
      {saveConflict?.projectId === activeProject.id ? (
        <section className="dashboard-confirm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="cloud-save-conflict-title">
          <div className="dashboard-confirm-dialog">
            <header><strong id="cloud-save-conflict-title">This project changed elsewhere</strong></header>
            <p>Your local work is still open. Save it as a separate cloud copy or download a recovery file before loading the remote version.</p>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" disabled={recoveryBusy} onClick={() => void downloadRecovery(saveConflict.projectName, documentRef.current)}>Download recovery</button>
              <button className="dashboard-confirm-save" type="button" disabled={recoveryBusy} onClick={() => void saveLocalAsCopy()}>Save as cloud copy</button>
            </div>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-delete" type="button" disabled={recoveryBusy} onClick={() => void reloadRemoteProject()}>Load remote version</button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
