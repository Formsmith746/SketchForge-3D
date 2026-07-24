"use client";

import { Clock3, EllipsisVertical, FileUp, FolderKanban, Grid3X3, HomeIcon, List, Pencil, Plus, RefreshCw, Search, Settings, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SketchForgeEditor, importedShapeFromStl, importedShapeFromSvg } from "@/components/SketchForgeEditor";
import { hydrateEditorHistoryState, type EditorHistoryEntry } from "@/lib/editorHistory";
import { createLocalId } from "@/lib/localIds";
import { attachProjectAsset, dedupeProjectAssets, projectAssetFromBytes, sourceFormatForFileName } from "@/lib/projectAssets";
import { importSkfProject, SKF_CREATED_WITH_VERSION } from "@/lib/skfProject";
import { importExtensionSupported } from "@/lib/stlImport";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE, normalizeSnapGrid, normalizeWorkspaceSettings, workplaneSettingsFingerprint } from "@/lib/workplaneSettings";
import type { GridSize, ProjectAsset, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

type AppView = "dashboard" | "editor";
type ViewMode = "grid" | "list";
type DashboardSection = "home" | "shared" | "challenges";
type DownloadMode = "browser" | "folder";

type DashboardProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  shapes: number;
  accent: "cyan" | "green" | "gold" | "red";
  thumbnailUrl?: string | null;
  thumbnailVersion?: number;
  revision?: number;
  workspace?: WorkplaneWorkspaceSettings;
  snapGrid?: GridSize;
  placementElevation?: number;
  sharedProject?: { fileName: string; revision: string };
};

type SharedProject = {
  fileName: string;
  name: string;
  updatedAt: number;
  size: number;
  revision: string;
};

type StoredDashboardProject = Partial<DashboardProject> & {
  designShapes?: unknown;
};

type ProjectShapeCacheEntry = {
  revision: number;
  shapes: WorkplaneShape[];
  history: EditorHistoryEntry[];
  historyIndex: number;
  assets: ProjectAsset[];
};

type ProjectShapeRecord = {
  id: string;
  revision: number;
  shapes: WorkplaneShape[];
  history?: EditorHistoryEntry[];
  historyIndex?: number;
  assets?: ProjectAsset[];
  updatedAt: number;
};

const PROJECTS_STORAGE_KEY = "sketchForge.projects";
const PROJECT_SHAPES_DB_NAME = "sketchForge.projectShapes";
const PROJECT_SHAPES_STORE_NAME = "projectShapes";
const DOWNLOAD_MODE_STORAGE_KEY = "sketchForge.downloadMode";
const DOWNLOAD_FOLDER_STORAGE_KEY = "sketchForge.downloadFolder";
const THEME_STORAGE_KEY = "sketchForge.defaultTheme";
const PROJECT_ACCENTS: DashboardProject["accent"][] = ["cyan", "green", "gold", "red"];
const STATIC_EXPORT_BUILD = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

function readSavedDefaultTheme(): { themeId?: string; customTheme?: import("@/lib/themes").AppTheme } {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.themeId === "string") {
      return { themeId: parsed.themeId, customTheme: parsed.customTheme };
    }
  } catch {}
  return {};
}

function formatUpdated(timestamp: number) {
  const age = Date.now() - timestamp;
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return `${Math.max(1, Math.round(age / 60_000))} min ago`;
  if (age < 86_400_000) return "Today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function projectShapeCacheEntry(
  revision: number,
  shapes: WorkplaneShape[],
  history?: EditorHistoryEntry[],
  historyIndex?: number,
  assets: ProjectAsset[] = [],
): ProjectShapeCacheEntry {
  const hydrated = hydrateEditorHistoryState(shapes, history, historyIndex);
  return {
    revision,
    shapes: hydrated.entries[hydrated.index]?.shapes ?? shapes,
    history: hydrated.entries,
    historyIndex: hydrated.index,
    assets: dedupeProjectAssets(assets),
  };
}

function openProjectShapesDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("Project shape storage is unavailable"));
      return;
    }

    const request = window.indexedDB.open(PROJECT_SHAPES_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_SHAPES_STORE_NAME)) {
        database.createObjectStore(PROJECT_SHAPES_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open project shape storage"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function loadProjectShapes(projectId: string) {
  const database = await openProjectShapesDb();
  return new Promise<ProjectShapeRecord | null>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_SHAPES_STORE_NAME, "readonly");
    const request = transaction.objectStore(PROJECT_SHAPES_STORE_NAME).get(projectId);
    request.onerror = () => reject(request.error ?? new Error("Could not load project shapes"));
    request.onsuccess = () => resolve((request.result as ProjectShapeRecord | undefined) ?? null);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not load project shapes"));
    };
  });
}

async function saveProjectShapes(projectId: string, entry: ProjectShapeCacheEntry) {
  const database = await openProjectShapesDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_SHAPES_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PROJECT_SHAPES_STORE_NAME);
    const existingRequest = store.get(projectId);
    existingRequest.onerror = () => {
      transaction.abort();
    };
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as ProjectShapeRecord | undefined;
      if (existing && existing.revision > entry.revision) {
        return;
      }
      store.put({ id: projectId, ...entry, updatedAt: Date.now() } satisfies ProjectShapeRecord);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save project shapes"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save project shapes"));
    };
  });
}

async function deleteProjectShapes(projectId: string) {
  const database = await openProjectShapesDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_SHAPES_STORE_NAME, "readwrite");
    transaction.objectStore(PROJECT_SHAPES_STORE_NAME).delete(projectId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not delete project shapes"));
    };
  });
}

function readStoredProjects() {
  const legacyShapes: Record<string, ProjectShapeCacheEntry> = {};
  if (typeof window === "undefined") return { projects: [] as DashboardProject[], legacyShapes };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROJECTS_STORAGE_KEY) ?? "[]") as StoredDashboardProject[];
    const projects = parsed
      .filter((project) => typeof project.id === "string" && typeof project.name === "string")
      .map((project, index) => {
        const id = project.id as string;
        const updatedAt = typeof project.updatedAt === "number" ? project.updatedAt : Date.now();
        const revision = typeof project.revision === "number" ? project.revision : updatedAt;
        const designShapes = Array.isArray(project.designShapes) ? (project.designShapes as WorkplaneShape[]) : null;
        if (designShapes) {
          legacyShapes[id] = projectShapeCacheEntry(revision, designShapes);
        }
        return {
          id,
          name: project.name as string,
          createdAt: typeof project.createdAt === "number" ? project.createdAt : Date.now(),
          updatedAt,
          shapes: typeof project.shapes === "number" ? project.shapes : (designShapes?.length ?? 0),
          accent: PROJECT_ACCENTS.includes(project.accent as DashboardProject["accent"]) ? (project.accent as DashboardProject["accent"]) : PROJECT_ACCENTS[index % PROJECT_ACCENTS.length],
          thumbnailUrl: typeof project.thumbnailUrl === "string" ? project.thumbnailUrl : null,
          thumbnailVersion: typeof project.thumbnailVersion === "number" ? project.thumbnailVersion : undefined,
          revision,
          workspace: normalizeWorkspaceSettings(project.workspace),
          snapGrid: normalizeSnapGrid(project.snapGrid),
          placementElevation: typeof project.placementElevation === "number" && Number.isFinite(project.placementElevation) ? project.placementElevation : 0,
          sharedProject: typeof project.sharedProject?.fileName === "string" && typeof project.sharedProject.revision === "string"
            ? { fileName: project.sharedProject.fileName, revision: project.sharedProject.revision }
            : undefined,
        };
      });
    return { projects, legacyShapes };
  } catch {
    return { projects: [], legacyShapes };
  }
}

function readProjects() {
  return readStoredProjects().projects;
}

function mergeProjectForStorage(project: DashboardProject, storedProject?: DashboardProject) {
  if (!storedProject) {
    return project;
  }
  const projectRevision = project.revision ?? 0;
  const storedRevision = storedProject.revision ?? 0;
  if (storedRevision <= projectRevision) {
    return project;
  }
  return {
    ...project,
    revision: storedProject.revision,
    shapes: storedProject.shapes || project.shapes,
    thumbnailUrl: project.thumbnailUrl ?? storedProject.thumbnailUrl,
    thumbnailVersion: project.thumbnailVersion ?? storedProject.thumbnailVersion,
    updatedAt: Math.max(project.updatedAt, storedProject.updatedAt),
    workspace: project.workspace ?? storedProject.workspace,
    snapGrid: project.snapGrid ?? storedProject.snapGrid,
    placementElevation: project.placementElevation ?? storedProject.placementElevation,
    sharedProject: project.sharedProject ?? storedProject.sharedProject,
  };
}

function projectForStorage(project: DashboardProject): DashboardProject {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    shapes: project.shapes,
    accent: project.accent,
    thumbnailUrl: project.thumbnailUrl ?? null,
    thumbnailVersion: project.thumbnailVersion,
    revision: project.revision,
    workspace: normalizeWorkspaceSettings(project.workspace),
    snapGrid: normalizeSnapGrid(project.snapGrid),
    placementElevation: typeof project.placementElevation === "number" && Number.isFinite(project.placementElevation) ? project.placementElevation : 0,
    sharedProject: project.sharedProject,
  };
}

function mergeProjectsForStorage(projects: DashboardProject[]) {
  const storedProjects = readProjects();
  const storedById = new Map(storedProjects.map((project) => [project.id, project]));
  return projects.map((project) => projectForStorage(mergeProjectForStorage(project, storedById.get(project.id))));
}

function newProject(name: string, index: number, shapeCount = 0): DashboardProject {
  const now = Date.now();
  const savedTheme = readSavedDefaultTheme();
  return {
    id: createLocalId("project"),
    name,
    createdAt: now,
    updatedAt: now,
    shapes: shapeCount,
    accent: PROJECT_ACCENTS[index % PROJECT_ACCENTS.length],
    revision: now,
    workspace: {
      ...DEFAULT_WORKPLANE_WORKSPACE,
      themeId: savedTheme.themeId,
      customTheme: savedTheme.customTheme,
    },
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 0,
  };
}

function projectNameFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Imported design";
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<AppView>("dashboard");
  const [editorStarted, setEditorStarted] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>("home");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] = useState("recent");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadMode, setDownloadMode] = useState<DownloadMode>("browser");
  const [downloadFolder, setDownloadFolder] = useState("");
  const [dashboardNotice, setDashboardNotice] = useState("");
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [sharedProjectsEnabled, setSharedProjectsEnabled] = useState(false);
  const [sharedProjectsLoading, setSharedProjectsLoading] = useState(false);
  const [projectShapesById, setProjectShapesById] = useState<Record<string, ProjectShapeCacheEntry>>({});
  const projectsJsonRef = useRef("");
  const dashboardImportInputRef = useRef<HTMLInputElement | null>(null);
  const nextProjectRevisionRef = useRef(0);
  const projectShapeSaveQueuesRef = useRef<Record<string, Promise<void>>>({});

  const refreshSharedProjects = useCallback(async () => {
    if (STATIC_EXPORT_BUILD) return;
    setSharedProjectsLoading(true);
    try {
      const response = await fetch("/api/shared-projects", { cache: "no-store" });
      const payload = await response.json() as { enabled?: boolean; projects?: SharedProject[]; error?: string };
      setSharedProjectsEnabled(Boolean(payload.enabled));
      setSharedProjects(Array.isArray(payload.projects) ? payload.projects : []);
      if (!response.ok && payload.enabled) setDashboardNotice(payload.error ?? "Could not load shared projects");
    } catch {
      setSharedProjectsEnabled(false);
      setSharedProjects([]);
    } finally {
      setSharedProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "light";
    try {
      window.localStorage.removeItem("sketchForge.theme");
    } catch {
      // Light mode still applies when browser storage is unavailable.
    }
    const { projects: storedProjects, legacyShapes } = readStoredProjects();
    setProjects(storedProjects);
    if (Object.keys(legacyShapes).length > 0) {
      setProjectShapesById(legacyShapes);
      Object.entries(legacyShapes).forEach(([projectId, entry]) => {
        void saveProjectShapes(projectId, entry).catch(() => {
          setDashboardNotice("Could not migrate project shapes to larger storage");
        });
      });
    }
    setDownloadMode(!STATIC_EXPORT_BUILD && window.localStorage.getItem(DOWNLOAD_MODE_STORAGE_KEY) === "folder" ? "folder" : "browser");
    setDownloadFolder(window.localStorage.getItem(DOWNLOAD_FOLDER_STORAGE_KEY) ?? "");

    const params = new URLSearchParams(window.location.search);
    if (params.has("codexBooleanCase") || params.get("editor") === "1") {
      const requestedProjectId = params.get("project");
      if (requestedProjectId && storedProjects.some((project) => project.id === requestedProjectId)) {
        setActiveProjectId(requestedProjectId);
      }
      setEditorStarted(true);
      setView("editor");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void refreshSharedProjects();
  }, [mounted, refreshSharedProjects]);

  useEffect(() => {
    if (!mounted) return;
    const localSerialized = JSON.stringify(projects);
    const storageProjects = mergeProjectsForStorage(projects);
    const serialized = JSON.stringify(storageProjects);
    if (projectsJsonRef.current === serialized) return;
    try {
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, serialized);
    } catch (error) {
      try {
        window.localStorage.removeItem(PROJECTS_STORAGE_KEY);
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, serialized);
      } catch {
        setDashboardNotice(error instanceof Error ? error.message : "Could not save project list");
        return;
      }
    }
    projectsJsonRef.current = serialized;
    if (serialized !== localSerialized) {
      setProjects(storageProjects);
    }
  }, [mounted, projects]);

  useEffect(() => {
    if (!mounted) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PROJECTS_STORAGE_KEY) return;
      projectsJsonRef.current = event.newValue ?? "[]";
      setProjects(readProjects());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mounted]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (projects.some((project) => project.id === activeProjectId)) return;
    setActiveProjectId(null);
    setView("dashboard");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (!mounted || !activeProjectId) return;
    const activeProject = projects.find((project) => project.id === activeProjectId);
    if (!activeProject) return;
    const cached = projectShapesById[activeProjectId];
    if (cached && cached.revision === activeProject.revision) return;

    let canceled = false;
    void loadProjectShapes(activeProjectId)
      .then((record) => {
        if (canceled) return;
        const revision = activeProject.revision ?? record?.revision ?? Date.now();
        const entry = projectShapeCacheEntry(revision, record?.shapes ?? [], record?.history, record?.historyIndex, record?.assets);
        setProjectShapesById((current) => ({
          ...current,
          [activeProjectId]: entry,
        }));
      })
      .catch((error) => {
        if (!canceled) {
          setDashboardNotice(error instanceof Error ? error.message : "Could not load project shapes");
          setProjectShapesById((current) => ({
            ...current,
            [activeProjectId]: projectShapeCacheEntry(activeProject.revision ?? Date.now(), []),
          }));
        }
      });
    return () => {
      canceled = true;
    };
  }, [activeProjectId, mounted, projectShapesById, projects]);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(DOWNLOAD_MODE_STORAGE_KEY, downloadMode);
    window.localStorage.setItem(DOWNLOAD_FOLDER_STORAGE_KEY, downloadFolder);
  }, [downloadFolder, downloadMode, mounted]);

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery ? projects.filter((project) => project.name.toLowerCase().includes(normalizedQuery)) : projects;
    return sortMode === "name" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, query, sortMode]);

  const visibleSharedProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery ? sharedProjects.filter((project) => project.name.toLowerCase().includes(normalizedQuery)) : sharedProjects;
    return sortMode === "name" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [query, sharedProjects, sortMode]);

  const openEditor = (projectId: string | null, options: { allowMissingFromStorage?: boolean } = {}) => {
    if (projectId && typeof window !== "undefined" && !options.allowMissingFromStorage) {
      const storedProjects = readProjects();
      const storedProject = storedProjects.find((project) => project.id === projectId);
      if (!storedProject) {
        setProjects(storedProjects);
        setActiveProjectId(null);
        setView("dashboard");
        window.history.replaceState(null, "", "/");
        return;
      }
      setProjects(storedProjects.map((project) => (project.id === projectId ? { ...project, updatedAt: Date.now() } : project)));
    } else if (projectId) {
      setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, updatedAt: Date.now() } : project)));
    }
    setActiveProjectId(projectId);
    setEditorStarted(true);
    setView("editor");
    if (typeof window !== "undefined") {
      const nextUrl = projectId ? `/?editor=1&project=${encodeURIComponent(projectId)}` : "/?editor=1";
      window.history.replaceState(null, "", nextUrl);
    }
  };

  const updateProjectSnapshot = useCallback((snapshot: { image: string; projectId: string; shapes: number }) => {
    const version = Date.now();
    if (STATIC_EXPORT_BUILD) {
      setProjects((current) =>
        current.map((project) =>
          project.id === snapshot.projectId
            ? { ...project, shapes: snapshot.shapes, thumbnailUrl: snapshot.image, thumbnailVersion: version, updatedAt: version }
            : project,
        ),
      );
      return;
    }

    setProjects((current) =>
      current.map((project) => (project.id === snapshot.projectId ? { ...project, shapes: snapshot.shapes, updatedAt: version } : project)),
    );
    void fetch("/api/project-thumbnail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: snapshot.image, projectId: snapshot.projectId }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Thumbnail request failed with ${response.status}`);
        return response.json() as Promise<{ version?: number }>;
      })
      .then((payload) => {
        const nextVersion = payload.version ?? Date.now();
        const thumbnailUrl = `/api/project-thumbnail?projectId=${encodeURIComponent(snapshot.projectId)}&v=${nextVersion}`;
        setProjects((current) =>
          current.map((project) =>
            project.id === snapshot.projectId
              ? { ...project, shapes: snapshot.shapes, thumbnailUrl, thumbnailVersion: nextVersion, updatedAt: nextVersion }
              : project,
          ),
        );
      })
      .catch(() => {
        setProjects((current) =>
          current.map((project) => (project.id === snapshot.projectId ? { ...project, shapes: snapshot.shapes, updatedAt: version } : project)),
        );
      });
  }, []);

  const updateProjectShapes = useCallback((snapshot: {
    projectId: string;
    shapes: WorkplaneShape[];
    history: EditorHistoryEntry[];
    historyIndex: number;
    assets: ProjectAsset[];
  }) => {
    const revision = Math.max(Date.now(), nextProjectRevisionRef.current + 1);
    nextProjectRevisionRef.current = revision;
    const entry = projectShapeCacheEntry(revision, snapshot.shapes, snapshot.history, snapshot.historyIndex, snapshot.assets);
    setProjectShapesById((current) => {
      const existing = current[snapshot.projectId];
      if (existing && existing.revision > revision) {
        return current;
      }
      return {
        ...current,
        [snapshot.projectId]: entry,
      };
    });

    const previousSave = projectShapeSaveQueuesRef.current[snapshot.projectId] ?? Promise.resolve();
    const queuedSave = previousSave.catch(() => undefined).then(() => saveProjectShapes(snapshot.projectId, entry));
    projectShapeSaveQueuesRef.current[snapshot.projectId] = queuedSave;

    void queuedSave
      .then(() => {
        setProjects((current) =>
          current.map((project) =>
            project.id === snapshot.projectId && (project.revision ?? 0) <= revision
              ? { ...project, shapes: snapshot.shapes.length, updatedAt: revision, revision }
              : project,
          ),
        );
      })
      .catch((error) => {
        if (projectShapeSaveQueuesRef.current[snapshot.projectId] === queuedSave) {
          setDashboardNotice(error instanceof Error ? error.message : "Could not save project shapes");
        }
      })
      .finally(() => {
        if (projectShapeSaveQueuesRef.current[snapshot.projectId] === queuedSave) {
          delete projectShapeSaveQueuesRef.current[snapshot.projectId];
        }
      });
  }, []);

  const updateProjectWorkspace = useCallback((snapshot: { projectId: string; workspace: WorkplaneWorkspaceSettings; snap: GridSize; placementElevation?: number }) => {
    const version = Date.now();
    const workspace = normalizeWorkspaceSettings(snapshot.workspace);
    const snapGrid = normalizeSnapGrid(snapshot.snap);
    const placementElevation = typeof snapshot.placementElevation === "number" && Number.isFinite(snapshot.placementElevation)
      ? snapshot.placementElevation
      : 0;
    const nextFingerprint = `${workplaneSettingsFingerprint(workspace, snapGrid)}:${placementElevation}`;
    setProjects((current) => {
      let changed = false;
      const next = current.map((project) => {
        if (project.id !== snapshot.projectId) return project;
        const currentFingerprint = `${workplaneSettingsFingerprint(
          normalizeWorkspaceSettings(project.workspace),
          normalizeSnapGrid(project.snapGrid),
        )}:${project.placementElevation ?? 0}`;
        if (currentFingerprint === nextFingerprint) return project;
        changed = true;
        return {
          ...project,
          workspace,
          snapGrid,
          placementElevation,
          updatedAt: version,
        };
      });
      return changed ? next : current;
    });
  }, []);

  const createAndOpenProject = (name?: string) => {
    const project = newProject(name ?? `Untitled design ${projects.length + 1}`, projects.length);
    setProjectShapesById((current) => ({
      ...current,
      [project.id]: projectShapeCacheEntry(project.revision ?? project.updatedAt, []),
    }));
    void saveProjectShapes(project.id, projectShapeCacheEntry(project.revision ?? project.updatedAt, [])).catch(() => {
      setDashboardNotice("Could not prepare project shape storage");
    });
    setProjects((current) => [project, ...current]);
    openEditor(project.id, { allowMissingFromStorage: true });
  };

  const openSkfProjectFromFile = useCallback(async (file: File, sharedProject?: SharedProject) => {
    setDashboardNotice(`Validating ${file.name} before opening it as a new project`);
    try {
      const restored = await importSkfProject(await file.arrayBuffer());
      const now = Date.now();
      const project: DashboardProject = {
        ...newProject(restored.projectName, projects.length, restored.shapes.length),
        createdAt: restored.createdAt,
        updatedAt: now,
        revision: now,
        workspace: restored.workspace,
        snapGrid: restored.snapGrid,
        placementElevation: restored.placementElevation,
        sharedProject: sharedProject ? { fileName: sharedProject.fileName, revision: sharedProject.revision } : undefined,
      };
      const entry = projectShapeCacheEntry(now, restored.shapes, restored.history, restored.historyIndex, restored.assets);
      await saveProjectShapes(project.id, entry);
      setProjectShapesById((current) => ({ ...current, [project.id]: entry }));
      setProjects((current) => [project, ...current]);
      setDashboardNotice(sharedProject ? `Opened shared project ${sharedProject.name}; edits autosave locally until you save back to shared` : `Opened ${file.name} as a new editable local project`);
      openEditor(project.id, { allowMissingFromStorage: true });
      return { ok: true, message: sharedProject ? `Opened shared project ${sharedProject.name}` : `Opened ${file.name} as a new editable local project` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open SketchForge project";
      setDashboardNotice(message);
      return { ok: false, message };
    }
  }, [projects.length]);

  const openSharedProject = useCallback(async (sharedProject: SharedProject) => {
    setDashboardNotice(`Opening shared project ${sharedProject.name}`);
    try {
      const response = await fetch(`/api/shared-projects?fileName=${encodeURIComponent(sharedProject.fileName)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "Could not download shared project");
      }
      const revision = response.headers.get("etag")?.replace(/^W\//, "").replace(/^"|"$/g, "") || sharedProject.revision;
      const file = new File([await response.blob()], sharedProject.fileName, { type: "application/vnd.sketchforge.project+zip" });
      await openSkfProjectFromFile(file, { ...sharedProject, revision });
    } catch (error) {
      setDashboardNotice(error instanceof Error ? error.message : "Could not open shared project");
    }
  }, [openSkfProjectFromFile]);

  const saveActiveProjectToShared = useCallback(async ({ exportName, bytes }: { exportName: string; bytes: Uint8Array }) => {
    const activeProject = projects.find((project) => project.id === activeProjectId);
    if (!activeProject) throw new Error("Open a local project before saving it to the shared space");
    const normalizedExportName = exportName.trim() || activeProject.name;
    const saveBackToSource = Boolean(activeProject.sharedProject && normalizedExportName === activeProject.name);
    const fileName = saveBackToSource && activeProject.sharedProject
      ? activeProject.sharedProject.fileName
      : `${normalizedExportName.replace(/\.skf$/i, "")}.skf`;
    const headers: Record<string, string> = { "Content-Type": "application/vnd.sketchforge.project+zip" };
    if (saveBackToSource && activeProject.sharedProject) headers["If-Match"] = `"${activeProject.sharedProject.revision}"`;
    else headers["If-None-Match"] = "*";
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const response = await fetch(`/api/shared-projects?fileName=${encodeURIComponent(fileName)}`, { method: "POST", headers, body });
    const payload = await response.json().catch(() => ({})) as { error?: string; project?: SharedProject };
    if (!response.ok || !payload.project) throw new Error(payload.error ?? "Could not save the shared project");
    const savedProject = payload.project;
    setProjects((current) => current.map((project) => project.id === activeProject.id
      ? { ...project, sharedProject: { fileName: savedProject.fileName, revision: savedProject.revision } }
      : project));
    await refreshSharedProjects();
    return `Saved ${savedProject.name} to the Docker shared project space`;
  }, [activeProjectId, projects, refreshSharedProjects]);

  const importFilesFromDashboard = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const projectFiles = files.filter((file) => /\.skf$/i.test(file.name));
      if (projectFiles.length) {
        if (files.length !== 1) {
          setDashboardNotice("Open one .skf project at a time; import STL, STEP, and SVG geometry separately");
          return;
        }
        await openSkfProjectFromFile(projectFiles[0]);
        return;
      }
      const importedShapes: WorkplaneShape[] = [];
      const importedAssets: ProjectAsset[] = [];
      const importedFileNames: string[] = [];
      const failures: Array<{ fileName: string; reason: string }> = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const sourceFormat = sourceFormatForFileName(file.name) ?? (file.type === "image/svg+xml" ? "svg" : null);
        const isSvg = sourceFormat === "svg";
        const isStep = sourceFormat === "step";
        if (!sourceFormat || sourceFormat === "obj" || (!isSvg && !isStep && !importExtensionSupported(file.name))) {
          failures.push({ fileName: file.name, reason: "Unsupported file type" });
          continue;
        }

        setDashboardNotice(`Importing ${index + 1} of ${files.length}: ${file.name}`);
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          const parsedShape = isStep
            ? await import("@/lib/stepImport").then(({ importedShapeFromStep }) => importedShapeFromStep(file.name, buffer))
            : isSvg
              ? importedShapeFromSvg(file.name, new TextDecoder().decode(bytes))
              : importedShapeFromStl(file.name, buffer);
          const asset = await projectAssetFromBytes(file.name, sourceFormat, bytes, file.type);
          importedShapes.push(attachProjectAsset(parsedShape, asset.id));
          importedAssets.push(asset);
          importedFileNames.push(file.name);
        } catch (error) {
          failures.push({
            fileName: file.name,
            reason: error instanceof Error ? error.message : "Could not read file",
          });
        }
      }

      const failureDetails = failures
        .slice(0, 3)
        .map((failure) => `${failure.fileName}: ${failure.reason}`)
        .join("; ");
      const remainingFailureCount = Math.max(0, failures.length - 3);
      const failureSummary = failures.length
        ? ` Failed: ${failureDetails}${remainingFailureCount ? `; plus ${remainingFailureCount} more` : ""}`
        : "";

      if (!importedShapes.length) {
        setDashboardNotice(files.length === 1 && failures[0] ? failures[0].reason : `Could not import any of the ${files.length} selected files.${failureSummary}`);
        return;
      }

      try {
        const projectName = importedShapes.length === 1
          ? projectNameFromFileName(importedFileNames[0])
          : `Imported design (${importedShapes.length} files)`;
        const project = newProject(projectName, projects.length, importedShapes.length);
        const revision = project.revision ?? project.updatedAt;
        const entry = projectShapeCacheEntry(revision, importedShapes, undefined, undefined, dedupeProjectAssets(importedAssets));
        await saveProjectShapes(project.id, entry);
        setProjectShapesById((current) => ({
          ...current,
          [project.id]: entry,
        }));
        const successSummary = importedShapes.length === 1 && files.length === 1
          ? `Imported ${files[0].name}`
          : `Imported ${importedShapes.length} of ${files.length} files`;
        setDashboardNotice(`${successSummary}.${failureSummary}`.trim());
        setProjects((current) => [project, ...current]);
        openEditor(project.id, { allowMissingFromStorage: true });
      } catch (error) {
        setDashboardNotice(error instanceof Error ? error.message : "Could not create a project for the imported files");
      }
    },
    [openSkfProjectFromFile, projects.length],
  );

  const openLatestProject = () => {
    const latest = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) {
      openEditor(latest.id);
      return;
    }
    createAndOpenProject();
  };

  const openDashboard = () => {
    if (activeProjectId) {
      setProjects((current) => current.map((project) => (project.id === activeProjectId ? { ...project, updatedAt: Date.now() } : project)));
    }
    setDashboardSection("home");
    setView("dashboard");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
  };

  const deleteProject = (projectId: string) => {
    setProjects((current) => current.filter((project) => project.id !== projectId));
    setProjectShapesById((current) => {
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
    if (!STATIC_EXPORT_BUILD) {
      void fetch(`/api/project-thumbnail?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
    }
    void deleteProjectShapes(projectId).catch(() => {
      setDashboardNotice("Could not delete project shapes from local storage");
    });
  };

  const renameProject = (projectId: string, name: string) => {
    const nextName = name.trim().slice(0, 80);
    if (!nextName) return;
    setProjects((current) =>
      current.map((project) => (project.id === projectId ? { ...project, name: nextName, updatedAt: Date.now() } : project)),
    );
  };

  if (!mounted) {
    return null;
  }

  const activeProject = activeProjectId ? projects.find((project) => project.id === activeProjectId) ?? null : null;
  const activeProjectShapeEntry = activeProjectId ? projectShapesById[activeProjectId] : null;
  const canRenderEditor = !activeProjectId || (Boolean(activeProject) && Boolean(activeProjectShapeEntry));
  const projectDebugSummary = projects.map((project) => ({
    id: project.id,
    revision: project.revision,
    shapes: project.shapes,
    designShapes: projectShapesById[project.id]?.shapes.length ?? null,
    thumbnail: Boolean(project.thumbnailUrl),
    workspace: Boolean(project.workspace),
    snapGrid: project.snapGrid ?? null,
  }));

  return (
    <>
      <pre data-codex-projects hidden>
        {JSON.stringify(projectDebugSummary)}
      </pre>
      <input
        ref={dashboardImportInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        accept=".skf,.stl,.step,.stp,.svg,image/svg+xml"
        onChange={(event) => {
          const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
          if (files.length) {
            void importFilesFromDashboard(files);
          }
          event.currentTarget.value = "";
        }}
      />
      {view === "dashboard" ? (
        <Dashboard
          dashboardSection={dashboardSection}
          dashboardNotice={dashboardNotice}
          downloadFolder={downloadFolder}
          downloadMode={downloadMode}
          projects={visibleProjects}
          query={query}
          settingsOpen={settingsOpen}
          sharedProjects={visibleSharedProjects}
          sharedProjectsEnabled={sharedProjectsEnabled}
          sharedProjectsLoading={sharedProjectsLoading}
          staticExportBuild={STATIC_EXPORT_BUILD}
          sortMode={sortMode}
          viewMode={viewMode}
          onCloseSettings={() => setSettingsOpen(false)}
          onCreate={() => createAndOpenProject()}
          onDeleteProject={deleteProject}
          onDownloadFolderChange={setDownloadFolder}
          onDownloadModeChange={setDownloadMode}
          onImportFile={() => dashboardImportInputRef.current?.click()}
          onChallenges={() => {
            setDashboardSection("challenges");
            setDashboardNotice("");
          }}
          onDashboardHome={() => setDashboardSection("home")}
          onOpenSharedProject={(project) => void openSharedProject(project)}
          onOpenProject={openEditor}
          onOpenSettings={() => setSettingsOpen(true)}
          onQueryChange={setQuery}
          onRenameProject={renameProject}
          onRefreshSharedProjects={() => void refreshSharedProjects()}
          onSharedProjects={() => {
            setDashboardSection("shared");
            setDashboardNotice("");
            void refreshSharedProjects();
          }}
          onSortModeChange={setSortMode}
          onViewModeChange={setViewMode}
          onWorkspace={openLatestProject}
        />
      ) : null}
      {editorStarted && canRenderEditor ? (
        <div className={view === "editor" ? "editor-stage active" : "editor-stage"} aria-hidden={view !== "editor"}>
          <SketchForgeEditor
            initialAssets={activeProjectShapeEntry?.assets ?? []}
            initialShapes={activeProjectShapeEntry?.shapes ?? []}
            initialHistory={activeProjectShapeEntry?.history}
            initialHistoryIndex={activeProjectShapeEntry?.historyIndex}
            initialSnap={activeProject?.snapGrid ?? DEFAULT_SNAP_GRID}
            initialWorkspace={activeProject?.workspace ?? DEFAULT_WORKPLANE_WORKSPACE}
            initialPlacementElevation={activeProject?.placementElevation ?? 0}
            onHome={openDashboard}
            onOpenSkfProjectFile={openSkfProjectFromFile}
            onSaveSharedProject={saveActiveProjectToShared}
            onProjectShapesChange={updateProjectShapes}
            onProjectSnapshot={updateProjectSnapshot}
            onProjectWorkspaceChange={updateProjectWorkspace}
            projectId={activeProjectId}
            projectName={activeProject?.name}
            projectCreatedAt={activeProject?.createdAt}
            projectModifiedAt={activeProject?.updatedAt}
            projectRevision={activeProjectShapeEntry?.revision ?? activeProject?.revision ?? 0}
            sharedProjectsEnabled={sharedProjectsEnabled}
          />
        </div>
      ) : null}
    </>
  );
}

function Dashboard({
  dashboardSection,
  dashboardNotice,
  downloadFolder,
  downloadMode,
  projects,
  query,
  settingsOpen,
  sharedProjects,
  sharedProjectsEnabled,
  sharedProjectsLoading,
  staticExportBuild,
  sortMode,
  viewMode,
  onCloseSettings,
  onCreate,
  onDeleteProject,
  onDownloadFolderChange,
  onDownloadModeChange,
  onImportFile,
  onChallenges,
  onDashboardHome,
  onOpenSharedProject,
  onOpenProject,
  onOpenSettings,
  onQueryChange,
  onRenameProject,
  onRefreshSharedProjects,
  onSharedProjects,
  onSortModeChange,
  onViewModeChange,
  onWorkspace,
}: {
  dashboardSection: DashboardSection;
  dashboardNotice: string;
  downloadFolder: string;
  downloadMode: DownloadMode;
  projects: DashboardProject[];
  query: string;
  settingsOpen: boolean;
  sharedProjects: SharedProject[];
  sharedProjectsEnabled: boolean;
  sharedProjectsLoading: boolean;
  staticExportBuild: boolean;
  sortMode: string;
  viewMode: ViewMode;
  onCloseSettings: () => void;
  onCreate: () => void;
  onDeleteProject: (projectId: string) => void;
  onDownloadFolderChange: (value: string) => void;
  onDownloadModeChange: (value: DownloadMode) => void;
  onImportFile: () => void;
  onChallenges: () => void;
  onDashboardHome: () => void;
  onOpenSharedProject: (project: SharedProject) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onQueryChange: (value: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onRefreshSharedProjects: () => void;
  onSharedProjects: () => void;
  onSortModeChange: (value: string) => void;
  onViewModeChange: (value: ViewMode) => void;
  onWorkspace: () => void;
}) {
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [projectPendingDeleteId, setProjectPendingDeleteId] = useState<string | null>(null);
  const [projectPendingRenameId, setProjectPendingRenameId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const projectPendingDelete = projects.find((project) => project.id === projectPendingDeleteId) ?? null;
  const projectPendingRename = projects.find((project) => project.id === projectPendingRenameId) ?? null;

  useEffect(() => {
    if (!projectPendingDeleteId) return;
    if (projects.some((project) => project.id === projectPendingDeleteId)) return;
    setProjectPendingDeleteId(null);
  }, [projectPendingDeleteId, projects]);

  const confirmProjectDelete = () => {
    if (!projectPendingDelete) return;
    onDeleteProject(projectPendingDelete.id);
    setProjectPendingDeleteId(null);
  };

  const startProjectRename = (project: DashboardProject) => {
    setOpenProjectMenuId(null);
    setProjectPendingRenameId(project.id);
    setProjectNameDraft(project.name);
  };

  const closeProjectRename = () => {
    setProjectPendingRenameId(null);
    setProjectNameDraft("");
  };

  const confirmProjectRename = () => {
    if (!projectPendingRename || !projectNameDraft.trim()) return;
    onRenameProject(projectPendingRename.id, projectNameDraft);
    closeProjectRename();
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <button className="dashboard-brand" type="button" aria-label="Home">
          <img src="assets/sketchforge/sketchforge-logo.png" alt="" />
          <span>SketchForge</span>
        </button>
        <div className="dashboard-search">
          <Search size={18} strokeWidth={2.4} />
          <input value={query} onChange={(event) => onQueryChange(event.currentTarget.value)} placeholder="Search projects" aria-label="Search projects" />
        </div>
        <button className="dashboard-primary" type="button" onClick={onCreate}>
          <Plus size={20} strokeWidth={2.6} />
          <span>Create</span>
        </button>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="dashboard-nav-stack">
            <button className={`dashboard-nav-item ${dashboardSection === "home" ? "active" : ""}`} type="button" aria-label="Home" title="Home" onClick={onDashboardHome}>
              <HomeIcon size={20} />
              <span>Home</span>
            </button>
            {sharedProjectsEnabled ? (
              <button className={`dashboard-nav-item ${dashboardSection === "shared" ? "active" : ""}`} type="button" aria-label="Shared projects" title="Shared projects" onClick={onSharedProjects}>
                <FolderKanban size={20} />
                <span>Shared</span>
              </button>
            ) : null}
            <button className={`dashboard-nav-item ${dashboardSection === "challenges" ? "active" : ""}`} type="button" aria-label="Challenges" title="Challenges" onClick={onChallenges}>
              <SlidersHorizontal size={20} />
              <span>Challenges</span>
            </button>
          </div>
          <button className="dashboard-nav-item dashboard-settings-button" type="button" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </aside>

        <section className="dashboard-main" aria-label={dashboardSection === "challenges" ? "Challenges" : dashboardSection === "shared" ? "Shared projects" : "Dashboard"}>
          {dashboardSection === "challenges" ? (
            <div className="dashboard-coming-soon" role="status">
              <strong>Coming soon</strong>
            </div>
          ) : dashboardSection === "shared" ? (
            <>
              {dashboardNotice ? <div className="dashboard-import-notice" role="status">{dashboardNotice}</div> : null}
              <div className="dashboard-section-header shared-projects-header">
                <div>
                  <h1>Shared projects</h1>
                  <span>{sharedProjects.length} available from Docker storage</span>
                </div>
                <button className="shared-projects-refresh" type="button" onClick={onRefreshSharedProjects} disabled={sharedProjectsLoading}>
                  <RefreshCw size={16} className={sharedProjectsLoading ? "spinning" : undefined} />
                  <span>Refresh</span>
                </button>
              </div>
              {sharedProjects.length > 0 ? (
                <div className={viewMode === "grid" ? "project-grid" : "project-list"}>
                  {sharedProjects.map((project, index) => (
                    <article className="project-card shared-project-card" key={project.fileName}>
                      <button className="project-card-open" type="button" onClick={() => onOpenSharedProject(project)}>
                        <ProjectPreview accent={PROJECT_ACCENTS[index % PROJECT_ACCENTS.length]} />
                        <span className="project-card-title">{project.name}</span>
                        <span className="project-card-meta">{formatUpdated(project.updatedAt)} - {formatFileSize(project.size)}</span>
                      </button>
                      <span className="shared-project-badge">Shared</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="project-empty">
                  <strong>{sharedProjectsLoading ? "Loading shared projects" : "No shared projects yet"}</strong>
                  <span>Save an SKF project to the shared space from the Export window.</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="dashboard-actions-band">
                <button className="dashboard-action-tile create" type="button" onClick={onCreate}>
                  <span className="dashboard-action-icon">
                    <Plus size={25} strokeWidth={2.8} />
                  </span>
                  <span>Create new 3D design</span>
                </button>
                <button className="dashboard-action-tile" type="button" onClick={onImportFile}>
                  <span className="dashboard-action-icon">
                    <FileUp size={24} strokeWidth={2.4} />
                  </span>
                  <span>Open SKF or import geometry</span>
                </button>
                <button className="dashboard-action-tile" type="button" onClick={onWorkspace}>
                  <span className="dashboard-action-icon">
                    <Clock3 size={24} strokeWidth={2.4} />
                  </span>
                  <span>Continue workplane</span>
                </button>
              </div>
              {dashboardNotice ? (
                <div className="dashboard-import-notice" role="status">
                  {dashboardNotice}
                </div>
              ) : null}

              <div className="dashboard-section-header">
                <div>
                  <h1>Projects</h1>
                  <span>{projects.length} visible</span>
                </div>
                <div className="dashboard-controls">
                  <label className="dashboard-select">
                    <SlidersHorizontal size={17} />
                    <select value={sortMode} onChange={(event) => onSortModeChange(event.currentTarget.value)} aria-label="Sort projects">
                      <option value="recent">Recent</option>
                      <option value="name">Name</option>
                    </select>
                  </label>
                  <div className="dashboard-segmented" aria-label="Project view">
                    <button className={viewMode === "grid" ? "active" : ""} type="button" aria-label="Grid view" onClick={() => onViewModeChange("grid")}>
                      <Grid3X3 size={17} />
                    </button>
                    <button className={viewMode === "list" ? "active" : ""} type="button" aria-label="List view" onClick={() => onViewModeChange("list")}>
                      <List size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {projects.length > 0 ? (
                <div className={viewMode === "grid" ? "project-grid" : "project-list"}>
                  {projects.map((project) => (
                    <article className="project-card" key={project.id}>
                      <button className="project-card-open" type="button" onClick={() => onOpenProject(project.id)}>
                        <ProjectPreview accent={project.accent} thumbnailUrl={project.thumbnailUrl} />
                        <span className="project-card-title">{project.name}</span>
                        <span className="project-card-meta">
                          {formatUpdated(project.updatedAt)} - {project.shapes} shapes
                        </span>
                      </button>
                      <button
                        className="project-menu-trigger"
                        type="button"
                        aria-label={`Project options for ${project.name}`}
                        aria-expanded={openProjectMenuId === project.id}
                        title="Project options"
                        onClick={() => setOpenProjectMenuId((current) => (current === project.id ? null : project.id))}
                      >
                        <EllipsisVertical size={19} strokeWidth={2.5} />
                      </button>
                      {openProjectMenuId === project.id ? (
                        <div className="project-card-menu" role="menu" aria-label={`Options for ${project.name}`}>
                          <button type="button" role="menuitem" onClick={() => startProjectRename(project)}>
                            <Pencil size={16} />
                            <span>Rename</span>
                          </button>
                          <button
                            className="delete"
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenProjectMenuId(null);
                              setProjectPendingDeleteId(project.id);
                            }}
                          >
                            <Trash2 size={16} />
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="project-empty">
                  <strong>No projects yet</strong>
                  <span>Create a 3D design and it will appear here.</span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {projectPendingDelete ? (
        <section className="dashboard-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
          <div className="dashboard-confirm-dialog">
            <header>
              <strong id="delete-project-title">Delete project?</strong>
              <button type="button" aria-label="Cancel project deletion" onClick={() => setProjectPendingDeleteId(null)}>
                <X size={18} />
              </button>
            </header>
            <p>
              Do you actually want the project <span>{projectPendingDelete.name}</span> to be deleted?
            </p>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={() => setProjectPendingDeleteId(null)}>
                Cancel
              </button>
              <button className="dashboard-confirm-delete" type="button" onClick={confirmProjectDelete}>
                Delete
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {projectPendingRename ? (
        <section className="dashboard-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="rename-project-title">
          <form
            className="dashboard-confirm-dialog dashboard-rename-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              confirmProjectRename();
            }}
          >
            <header>
              <strong id="rename-project-title">Rename project</strong>
              <button type="button" aria-label="Cancel project rename" onClick={closeProjectRename}>
                <X size={18} />
              </button>
            </header>
            <label>
              <span>Project name</span>
              <input
                autoFocus
                maxLength={80}
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.currentTarget.value)}
                aria-label="Project name"
              />
            </label>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={closeProjectRename}>
                Cancel
              </button>
              <button className="dashboard-confirm-save" type="submit" disabled={!projectNameDraft.trim()}>
                Save
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {settingsOpen ? (
        <section className="dashboard-settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
          <header>
            <strong>Settings</strong>
            <button type="button" aria-label="Close settings" onClick={onCloseSettings}>
              <X size={18} />
            </button>
          </header>
          <label className="dashboard-setting-row">
            <span>Save method</span>
            <select
              value={downloadMode}
              onChange={(event) => onDownloadModeChange(!staticExportBuild && event.currentTarget.value === "folder" ? "folder" : "browser")}
            >
              <option value="browser">Browser downloads</option>
              {!staticExportBuild ? <option value="folder">Save to folder</option> : null}
            </select>
          </label>
          <label className="dashboard-setting-row">
            <span>Folder path</span>
            <input
              disabled={staticExportBuild || downloadMode !== "folder"}
              value={downloadFolder}
              onChange={(event) => onDownloadFolderChange(event.currentTarget.value)}
              placeholder="C:\\Users\\username\\Downloads"
            />
          </label>
          <div className="dashboard-version-row">
            <span>SketchForge version</span>
            <strong>{SKF_CREATED_WITH_VERSION}</strong>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ProjectPreview({ accent, thumbnailUrl }: { accent: DashboardProject["accent"]; thumbnailUrl?: string | null }) {
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const showThumbnail = Boolean(thumbnailUrl && thumbnailUrl !== failedThumbnailUrl);

  useEffect(() => {
    setFailedThumbnailUrl(null);
  }, [thumbnailUrl]);

  return (
    <span className={`project-preview accent-${accent}`} aria-hidden="true">
      {showThumbnail ? (
        <img className="project-thumbnail-image" src={thumbnailUrl ?? ""} alt="" onError={() => setFailedThumbnailUrl(thumbnailUrl ?? null)} />
      ) : (
        <>
          <span className="preview-grid" />
          <span className="preview-empty-mark">No snapshot yet</span>
        </>
      )}
    </span>
  );
}
