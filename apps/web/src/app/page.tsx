"use client";

import { Clock3, EllipsisVertical, FileUp, FolderKanban, Grid3X3, HomeIcon, List, Palette, Pencil, Plus, RefreshCw, Search, Settings, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SketchForgeEditor, importedShapeFromObj, importedShapeFromStl, importedShapeFromSvg } from "@/components/SketchForgeEditor";
import ChallengesDashboard from "@/components/official/ChallengesDashboard";
import {
  LANGUAGE_PREFERENCE_OPTIONS,
  LocalizedError,
  currentTranslator,
  errorFromPayload,
  errorFromResponse,
  errorText,
  formattingLocale,
  initLanguage,
  languagePreferenceLabel,
  normalizeLanguagePreference,
  notice,
  translate,
  useLanguagePreference,
  useLocale,
  useTranslations,
  type ErrorResponseFields,
  type Locale,
  type Translator,
} from "@/i18n";
import { applyAppTheme, readStoredAppTheme, resolveAppTheme, storeAppTheme, type AppThemePreference, type ResolvedAppTheme } from "@/lib/appTheme";
import type { AppUpdateStatus } from "@/lib/appUpdates";
import { isChallengeTutorialId, type ChallengeTutorialId } from "@/lib/challenges";
import { hydrateEditorHistoryState, type EditorHistoryEntry } from "@/lib/editorHistory";
import { createLocalId } from "@/lib/localIds";
import {
  horizontalPlacementWorkplane,
  normalizePlacementWorkplane,
  placementWorkplaneFingerprint,
  type PlacementWorkplane,
} from "@/lib/placementWorkplane";
import { attachProjectAsset, dedupeProjectAssets, projectAssetFromBytes, sourceFormatForFileName } from "@/lib/projectAssets";
import { hydrateProjectShapeState, reconcileLoadedProjectShapeCacheEntry, type ImportedMeshResource } from "@/lib/projectShapePersistence";
import { exportSkfProject, importSkfProject, SKF_CREATED_WITH_VERSION } from "@/lib/skfProject";
import { importExtensionSupported } from "@/lib/importExtensions";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE, normalizeSnapGrid, normalizeWorkspaceSettings, workplaneSettingsFingerprint } from "@/lib/workplaneSettings";
import type { GridSize, ProjectAsset, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

type AppView = "dashboard" | "editor";
type ViewMode = "grid" | "list";
type DashboardSection = "home" | "shared" | "challenges" | "customization";
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
  placementWorkplane?: PlacementWorkplane;
  sketchPlacementWorkplane?: PlacementWorkplane;
  sharedProject?: { fileName: string; revision: string };
};

type SharedProject = {
  fileName: string;
  name: string;
  updatedAt: number;
  size: number;
  revision: string;
  thumbnailUrl?: string;
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
  skfPackage?: Uint8Array;
  shapes?: WorkplaneShape[];
  history?: EditorHistoryEntry[];
  historyIndex?: number;
  assets?: ProjectAsset[];
  meshResourceIds?: string[];
  assetResourceIds?: string[];
  updatedAt: number;
};

type ProjectShapeSaveContext = {
  projectName: string;
  createdAt: number;
  workspace: WorkplaneWorkspaceSettings;
  snapGrid: GridSize;
  placementElevation: number;
  placementWorkplane: PlacementWorkplane;
  sketchPlacementWorkplane: PlacementWorkplane;
};

type ProjectShapeResourceRecord =
  | {
      id: string;
      projectId: string;
      resourceId: string;
      kind: "mesh";
      mesh: ImportedMeshResource;
    }
  | {
      id: string;
      projectId: string;
      resourceId: string;
      kind: "asset";
      asset: ProjectAsset;
    };

const PROJECTS_STORAGE_KEY = "sketchForge.projects";
const PROJECT_SHAPES_DB_NAME = "sketchForge.projectShapes";
const PROJECT_SHAPES_STORE_NAME = "projectShapes";
const PROJECT_SHAPE_RESOURCES_STORE_NAME = "projectShapeResources";
const DOWNLOAD_MODE_STORAGE_KEY = "sketchForge.downloadMode";
const DOWNLOAD_FOLDER_STORAGE_KEY = "sketchForge.downloadFolder";
const PROJECT_NAME_TOOLBAR_STORAGE_KEY = "sketchForge.showProjectNameInToolbar";
const ACTIVE_CHALLENGE_TUTORIAL_STORAGE_KEY = "sketchForge.activeChallengeTutorial";
const DISMISSED_UPDATE_VERSION_STORAGE_KEY = "sketchForge.dismissedUpdateVersion";
const PROJECT_ACCENTS: DashboardProject["accent"][] = ["cyan", "green", "gold", "red"];
const STATIC_EXPORT_BUILD = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const SOURCE_CODE_URL = process.env.NEXT_PUBLIC_SOURCE_CODE_URL?.trim() || "https://github.com/Formsmith746/SketchForge-3D";
const EDITOR_SKELETON_MIN_DURATION_MS = 320;
const knownProjectResourceKeys = new Map<string, Set<string>>();

function formatUpdated(t: Translator, locale: Locale, timestamp: number) {
  const age = Date.now() - timestamp;
  if (age < 60_000) return t("dashboard.time.justNow");
  if (age < 3_600_000) return t("dashboard.time.minutesAgo", { count: Math.max(1, Math.round(age / 60_000)) });
  if (age < 86_400_000) return t("dashboard.time.today");
  return new Intl.DateTimeFormat(formattingLocale(locale), { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function formatFileSize(t: Translator, locale: Locale, bytes: number) {
  const format = (value: number, fractionDigits: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits, useGrouping: false }).format(value);
  if (bytes < 1024) return t("dashboard.fileSize.bytes", { size: format(bytes, 0) });
  if (bytes < 1024 * 1024) return t("dashboard.fileSize.kilobytes", { size: format(bytes / 1024, bytes < 10 * 1024 ? 1 : 0) });
  return t("dashboard.fileSize.megabytes", { size: format(bytes / (1024 * 1024), bytes < 10 * 1024 * 1024 ? 1 : 0) });
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

function projectShapeCacheEntryFromEditor(
  revision: number,
  shapes: WorkplaneShape[],
  history: EditorHistoryEntry[],
  historyIndex: number,
  assets: ProjectAsset[],
): ProjectShapeCacheEntry {
  if (history.length === 0) {
    return projectShapeCacheEntry(revision, shapes, history, historyIndex, assets);
  }
  return {
    revision,
    shapes,
    history,
    historyIndex: Math.min(Math.max(0, historyIndex), history.length - 1),
    assets: dedupeProjectAssets(assets),
  };
}

function projectShapeSaveContext(project: Pick<DashboardProject, "name" | "createdAt" | "workspace" | "snapGrid" | "placementElevation" | "placementWorkplane" | "sketchPlacementWorkplane">): ProjectShapeSaveContext {
  const placementElevation = Number.isFinite(project.placementElevation) ? project.placementElevation ?? 0 : 0;
  return {
    projectName: project.name,
    createdAt: project.createdAt,
    workspace: normalizeWorkspaceSettings(project.workspace),
    snapGrid: normalizeSnapGrid(project.snapGrid),
    placementElevation,
    placementWorkplane: normalizePlacementWorkplane(project.placementWorkplane, placementElevation),
    sketchPlacementWorkplane: normalizePlacementWorkplane(project.sketchPlacementWorkplane),
  };
}

function openProjectShapesDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error(translate("dashboard.storage.unavailable")));
      return;
    }

    const request = window.indexedDB.open(PROJECT_SHAPES_DB_NAME, 3);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_SHAPES_STORE_NAME)) {
        database.createObjectStore(PROJECT_SHAPES_STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(PROJECT_SHAPE_RESOURCES_STORE_NAME)) {
        database.createObjectStore(PROJECT_SHAPE_RESOURCES_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error(translate("dashboard.storage.openFailed")));
    request.onsuccess = () => resolve(request.result);
  });
}

function projectResourceKey(kind: ProjectShapeResourceRecord["kind"], resourceId: string) {
  return `${kind}:${resourceId}`;
}

function projectResourceRecordId(projectId: string, kind: ProjectShapeResourceRecord["kind"], resourceId: string) {
  return `${projectId}:${projectResourceKey(kind, resourceId)}`;
}

async function loadProjectShapes(projectId: string) {
  const database = await openProjectShapesDb();
  const record = await new Promise<ProjectShapeRecord | null>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_SHAPES_STORE_NAME, "readonly");
    const request = transaction.objectStore(PROJECT_SHAPES_STORE_NAME).get(projectId);
    request.onerror = () => reject(request.error ?? new Error(translate("dashboard.storage.loadFailed")));
    request.onsuccess = () => resolve((request.result as ProjectShapeRecord | undefined) ?? null);
    transaction.onerror = () => reject(transaction.error ?? new Error(translate("dashboard.storage.loadFailed")));
  });
  if (!record) {
    database.close();
    return null;
  }
  if (record.skfPackage) {
    database.close();
    const restored = await importSkfProject(record.skfPackage);
    return {
      ...record,
      shapes: restored.shapes,
      history: restored.history,
      historyIndex: restored.historyIndex,
      assets: restored.assets,
    };
  }

  const meshResourceIds = record.meshResourceIds ?? [];
  const assetResourceIds = record.assetResourceIds ?? [];
  if (meshResourceIds.length === 0 && assetResourceIds.length === 0) {
    database.close();
    return {
      ...record,
      shapes: record.shapes ?? [],
    };
  }

  const resourceRecords = await new Promise<ProjectShapeResourceRecord[]>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_SHAPE_RESOURCES_STORE_NAME, "readonly");
    const store = transaction.objectStore(PROJECT_SHAPE_RESOURCES_STORE_NAME);
    const records: ProjectShapeResourceRecord[] = [];
    const requests = [
      ...meshResourceIds.map((resourceId) => store.get(projectResourceRecordId(projectId, "mesh", resourceId))),
      ...assetResourceIds.map((resourceId) => store.get(projectResourceRecordId(projectId, "asset", resourceId))),
    ];
    requests.forEach((request) => {
      request.onsuccess = () => {
        if (request.result) records.push(request.result as ProjectShapeResourceRecord);
      };
      request.onerror = () => {
        transaction.abort();
      };
    });
    transaction.oncomplete = () => resolve(records);
    transaction.onerror = () => reject(transaction.error ?? new Error(translate("dashboard.storage.resourcesLoadFailed")));
    transaction.onabort = () => reject(transaction.error ?? new Error(translate("dashboard.storage.resourcesLoadFailed")));
  });
  database.close();

  const meshResources = new Map<string, ImportedMeshResource>();
  const assets: ProjectAsset[] = [];
  resourceRecords.forEach((resource) => {
    if (resource.kind === "mesh") meshResources.set(resource.resourceId, resource.mesh);
    else assets.push(resource.asset);
  });
  if (meshResources.size !== meshResourceIds.length || assets.length !== assetResourceIds.length) {
    throw new Error(translate("dashboard.storage.resourcesIncomplete"));
  }
  knownProjectResourceKeys.set(projectId, new Set([
    ...meshResourceIds.map((resourceId) => projectResourceKey("mesh", resourceId)),
    ...assetResourceIds.map((resourceId) => projectResourceKey("asset", resourceId)),
  ]));
  const hydrated = hydrateProjectShapeState(record.shapes ?? [], record.history, meshResources);
  return {
    ...record,
    shapes: hydrated.shapes,
    history: hydrated.history,
    assets,
  };
}

async function saveProjectShapes(projectId: string, entry: ProjectShapeCacheEntry, context: ProjectShapeSaveContext) {
  const skfPackage = await exportSkfProject({
    projectId,
    projectName: context.projectName,
    createdAt: context.createdAt,
    modifiedAt: entry.revision,
    shapes: entry.shapes,
    history: entry.history,
    historyIndex: entry.historyIndex,
    assets: entry.assets,
    workspace: context.workspace,
    snapGrid: context.snapGrid,
    placementElevation: context.placementElevation,
    placementWorkplane: context.placementWorkplane,
    sketchPlacementWorkplane: context.sketchPlacementWorkplane,
    compressionLevel: 1,
  });
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
      store.put({
        id: projectId,
        revision: entry.revision,
        skfPackage,
        updatedAt: Date.now(),
      } satisfies ProjectShapeRecord);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error(translate("dashboard.storage.saveFailed")));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error(translate("dashboard.storage.saveFailed")));
    };
  });
}

function saveProjectShapesWhenIdle(projectId: string, entry: ProjectShapeCacheEntry, context: ProjectShapeSaveContext) {
  return new Promise<void>((resolve, reject) => {
    const save = () => {
      void saveProjectShapes(projectId, entry, context).then(resolve, reject);
    };
    if (typeof window === "undefined") {
      save();
      return;
    }
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(save, { timeout: 1200 });
      return;
    }
    globalThis.setTimeout(save, 32);
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
      reject(transaction.error ?? new Error(translate("dashboard.storage.deleteFailed")));
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
          placementWorkplane: normalizePlacementWorkplane(project.placementWorkplane, project.placementElevation),
          sketchPlacementWorkplane: normalizePlacementWorkplane(project.sketchPlacementWorkplane),
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
    workspace: storedProject.workspace ?? project.workspace,
    snapGrid: storedProject.snapGrid ?? project.snapGrid,
    placementElevation: storedProject.placementElevation ?? project.placementElevation,
    placementWorkplane: storedProject.placementWorkplane ?? project.placementWorkplane,
    sketchPlacementWorkplane: storedProject.sketchPlacementWorkplane ?? project.sketchPlacementWorkplane,
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
    placementWorkplane: normalizePlacementWorkplane(project.placementWorkplane, project.placementElevation),
    sketchPlacementWorkplane: normalizePlacementWorkplane(project.sketchPlacementWorkplane),
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
  return {
    id: createLocalId("project"),
    name,
    createdAt: now,
    updatedAt: now,
    shapes: shapeCount,
    accent: PROJECT_ACCENTS[index % PROJECT_ACCENTS.length],
    revision: now,
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 0,
    placementWorkplane: horizontalPlacementWorkplane(),
    sketchPlacementWorkplane: horizontalPlacementWorkplane(),
  };
}

function projectNameFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Imported design";
}

export default function Home() {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<AppView>("dashboard");
  const [editorStarted, setEditorStarted] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>("home");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] = useState("recent");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<AppThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedAppTheme>("light");
  const [downloadMode, setDownloadMode] = useState<DownloadMode>("browser");
  const [downloadFolder, setDownloadFolder] = useState("");
  const [showProjectNameInToolbar, setShowProjectNameInToolbar] = useState(true);
  const [dashboardNotice, setDashboardNotice] = useState("");
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [sharedProjectsEnabled, setSharedProjectsEnabled] = useState(false);
  const [sharedProjectsLoading, setSharedProjectsLoading] = useState(false);
  const [activeChallengeTutorial, setActiveChallengeTutorial] = useState<ChallengeTutorialId | null>(null);
  const [projectShapesById, setProjectShapesById] = useState<Record<string, ProjectShapeCacheEntry>>({});
  const projectsJsonRef = useRef("");
  const dashboardImportInputRef = useRef<HTMLInputElement | null>(null);
  const nextProjectRevisionRef = useRef(0);
  const projectShapeSaveQueuesRef = useRef<Record<string, Promise<void>>>({});
  const editorLoadingStartedAtRef = useRef(0);

  const startEditorTransition = useCallback(() => {
    editorLoadingStartedAtRef.current = Date.now();
    setEditorLoading(true);
  }, []);

  const refreshSharedProjects = useCallback(async () => {
    if (STATIC_EXPORT_BUILD) return;
    setSharedProjectsLoading(true);
    try {
      const response = await fetch("/api/shared-projects", { cache: "no-store" });
      const payload = await response.json() as { enabled?: boolean; projects?: SharedProject[] } & Partial<ErrorResponseFields>;
      setSharedProjectsEnabled(Boolean(payload.enabled));
      setSharedProjects(Array.isArray(payload.projects) ? payload.projects : []);
      if (!response.ok && payload.enabled) setDashboardNotice(errorText(currentTranslator(), errorFromResponse(payload), "errors.shared.loadFailed"));
    } catch {
      setSharedProjectsEnabled(false);
      setSharedProjects([]);
    } finally {
      setSharedProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    initLanguage();
    const storedTheme = readStoredAppTheme(window.localStorage);
    setThemePreference(storedTheme);
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setResolvedTheme(resolveAppTheme(storedTheme, systemPrefersDark));
    applyAppTheme(storedTheme, systemPrefersDark);
    const { projects: storedProjects, legacyShapes } = readStoredProjects();
    setProjects(storedProjects);
    if (Object.keys(legacyShapes).length > 0) {
      setProjectShapesById(legacyShapes);
      Object.entries(legacyShapes).forEach(([projectId, entry]) => {
        const project = storedProjects.find((candidate) => candidate.id === projectId);
        if (!project) return;
        void saveProjectShapes(projectId, entry, projectShapeSaveContext(project)).catch(() => {
          setDashboardNotice(translate("dashboard.storage.migrateFailed"));
        });
      });
    }
    setDownloadMode(!STATIC_EXPORT_BUILD && window.localStorage.getItem(DOWNLOAD_MODE_STORAGE_KEY) === "folder" ? "folder" : "browser");
    setDownloadFolder(window.localStorage.getItem(DOWNLOAD_FOLDER_STORAGE_KEY) ?? "");
    setShowProjectNameInToolbar(window.localStorage.getItem(PROJECT_NAME_TOOLBAR_STORAGE_KEY) !== "false");

    const params = new URLSearchParams(window.location.search);
    if (params.has("codexBooleanCase") || params.get("editor") === "1") {
      const requestedProjectId = params.get("project");
      if (requestedProjectId && storedProjects.some((project) => project.id === requestedProjectId)) {
        setActiveProjectId(requestedProjectId);
        try {
          const storedChallenge = JSON.parse(window.localStorage.getItem(ACTIVE_CHALLENGE_TUTORIAL_STORAGE_KEY) ?? "null") as { projectId?: string; tutorial?: ChallengeTutorialId } | null;
          if (storedChallenge?.projectId === requestedProjectId && isChallengeTutorialId(storedChallenge.tutorial)) {
            setActiveChallengeTutorial(storedChallenge.tutorial);
          }
        } catch {
          window.localStorage.removeItem(ACTIVE_CHALLENGE_TUTORIAL_STORAGE_KEY);
        }
      }
      startEditorTransition();
      setEditorStarted(true);
      setView("editor");
    }
    setMounted(true);
  }, [startEditorTransition]);

  useEffect(() => {
    if (!mounted) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyCurrentTheme = () => {
      setResolvedTheme(resolveAppTheme(themePreference, media.matches));
      applyAppTheme(themePreference, media.matches);
    };
    storeAppTheme(window.localStorage, themePreference);
    applyCurrentTheme();
    if (themePreference !== "system") return;
    media.addEventListener("change", applyCurrentTheme);
    return () => media.removeEventListener("change", applyCurrentTheme);
  }, [mounted, themePreference]);

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
        setDashboardNotice(errorText(currentTranslator(), error, "dashboard.storage.saveListFailed"));
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
    if (cached && cached.revision >= (activeProject.revision ?? 0)) return;

    let canceled = false;
    void loadProjectShapes(activeProjectId)
      .then((record) => {
        if (canceled) return;
        const loadedRevision = record?.revision ?? 0;
        const revision = Math.max(activeProject.revision ?? 0, loadedRevision, 1);
        const loadedEntry = projectShapeCacheEntry(Math.max(loadedRevision, 1), record?.shapes ?? [], record?.history, record?.historyIndex, record?.assets);
        const entry = loadedEntry.revision === revision ? loadedEntry : { ...loadedEntry, revision };
        setProjectShapesById((current) => {
          // IndexedDB reads are asynchronous. A local edit/import can update the live
          // cache while this older read is still in flight; never let that stale read
          // replace newer in-memory shapes. Bump the preserved entry to the requested
          // project revision so this effect does not immediately retry the same load.
          const existing = current[activeProjectId];
          const reconciled = reconcileLoadedProjectShapeCacheEntry(existing, entry, loadedRevision);
          if (reconciled === existing) return current;
          return {
            ...current,
            [activeProjectId]: reconciled,
          };
        });
        if (record && !record.skfPackage && loadedRevision > 0) {
          // Migrate the data at the revision it was actually read from disk. Using the
          // newer project metadata revision here can let stale shapes outrank a live edit.
          void saveProjectShapesWhenIdle(activeProjectId, loadedEntry, projectShapeSaveContext(activeProject)).catch(() => {
            // The legacy record remains readable and migration can retry on the next load.
          });
        }
      })
      .catch((error) => {
        if (!canceled) {
          setDashboardNotice(errorText(currentTranslator(), error, "dashboard.storage.loadFailed"));
          setProjectShapesById((current) => {
            // A failed background read must not erase a project that has already
            // received live editor changes while the read was pending.
            if (current[activeProjectId]) return current;
            return {
              ...current,
              [activeProjectId]: projectShapeCacheEntry(activeProject.revision ?? Date.now(), []),
            };
          });
        }
      });
    return () => {
      canceled = true;
    };
  }, [activeProjectId, mounted, projectShapesById, projects]);

  useEffect(() => {
    if (!editorLoading || view !== "editor") return;
    if (activeProjectId) {
      const activeProject = projects.find((project) => project.id === activeProjectId);
      const activeEntry = projectShapesById[activeProjectId];
      if (!activeProject || !activeEntry) return;
    }

    const elapsed = Date.now() - editorLoadingStartedAtRef.current;
    const remaining = Math.max(0, EDITOR_SKELETON_MIN_DURATION_MS - elapsed);
    const timer = window.setTimeout(() => {
      window.requestAnimationFrame(() => setEditorLoading(false));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, editorLoading, projectShapesById, projects, view]);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(DOWNLOAD_MODE_STORAGE_KEY, downloadMode);
    window.localStorage.setItem(DOWNLOAD_FOLDER_STORAGE_KEY, downloadFolder);
    window.localStorage.setItem(PROJECT_NAME_TOOLBAR_STORAGE_KEY, String(showProjectNameInToolbar));
  }, [downloadFolder, downloadMode, mounted, showProjectNameInToolbar]);

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

  const openEditor = (projectId: string | null, options: { allowMissingFromStorage?: boolean; challengeTutorial?: ChallengeTutorialId | null } = {}) => {
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
    startEditorTransition();
    let nextChallengeTutorial = options.challengeTutorial ?? null;
    if (typeof window !== "undefined" && projectId) {
      if (nextChallengeTutorial) {
        window.localStorage.setItem(
          ACTIVE_CHALLENGE_TUTORIAL_STORAGE_KEY,
          JSON.stringify({ projectId, tutorial: nextChallengeTutorial }),
        );
      } else {
        try {
          const storedChallenge = JSON.parse(window.localStorage.getItem(ACTIVE_CHALLENGE_TUTORIAL_STORAGE_KEY) ?? "null") as { projectId?: string; tutorial?: ChallengeTutorialId } | null;
          if (storedChallenge?.projectId === projectId && isChallengeTutorialId(storedChallenge.tutorial)) {
            nextChallengeTutorial = storedChallenge.tutorial;
          }
        } catch {
          window.localStorage.removeItem(ACTIVE_CHALLENGE_TUTORIAL_STORAGE_KEY);
        }
      }
    }
    setActiveChallengeTutorial(nextChallengeTutorial);
    setActiveProjectId(projectId);
    setEditorStarted(true);
    setView("editor");
    if (typeof window !== "undefined") {
      const nextUrl = projectId ? `/?editor=1&project=${encodeURIComponent(projectId)}` : "/?editor=1";
      window.history.replaceState(null, "", nextUrl);
    }
  };

  const updateProjectSnapshot = useCallback(async (snapshot: { image: string; projectId: string; shapes: number }, signal?: AbortSignal) => {
    const version = Date.now();
    if (signal?.aborted) throw new DOMException("Thumbnail upload aborted", "AbortError");
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
    try {
      const response = await fetch("/api/project-thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: snapshot.image, projectId: snapshot.projectId }),
        signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as Partial<ErrorResponseFields> | null;
        throw errorFromResponse(payload) ?? new LocalizedError("errors.thumbnail.saveFailed");
      }
      const payload = await response.json() as { version?: number };
      if (signal?.aborted) throw new DOMException("Thumbnail upload aborted", "AbortError");
      const nextVersion = payload?.version ?? Date.now();
      const thumbnailUrl = `/api/project-thumbnail?projectId=${encodeURIComponent(snapshot.projectId)}&v=${nextVersion}`;
      setProjects((current) =>
        current.map((project) =>
          project.id === snapshot.projectId
            ? { ...project, shapes: snapshot.shapes, thumbnailUrl, thumbnailVersion: nextVersion, updatedAt: nextVersion }
            : project,
        ),
      );
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      setProjects((current) =>
        current.map((project) => (project.id === snapshot.projectId ? { ...project, shapes: snapshot.shapes, updatedAt: version } : project)),
      );
      throw error;
    }
  }, []);

  const updateProjectShapes = useCallback((snapshot: {
    projectId: string;
    shapes: WorkplaneShape[];
    history: EditorHistoryEntry[];
    historyIndex: number;
    assets: ProjectAsset[];
    projectName: string;
    projectCreatedAt: number;
    workspace: WorkplaneWorkspaceSettings;
    snapGrid: GridSize;
    placementElevation: number;
    placementWorkplane: PlacementWorkplane;
    sketchPlacementWorkplane: PlacementWorkplane;
  }) => {
    const revision = Math.max(Date.now(), nextProjectRevisionRef.current + 1);
    nextProjectRevisionRef.current = revision;
    const entry = projectShapeCacheEntryFromEditor(revision, snapshot.shapes, snapshot.history, snapshot.historyIndex, snapshot.assets);
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
    const saveContext: ProjectShapeSaveContext = {
      projectName: snapshot.projectName,
      createdAt: snapshot.projectCreatedAt,
      workspace: normalizeWorkspaceSettings(snapshot.workspace),
      snapGrid: normalizeSnapGrid(snapshot.snapGrid),
      placementElevation: Number.isFinite(snapshot.placementElevation) ? snapshot.placementElevation : 0,
      placementWorkplane: normalizePlacementWorkplane(snapshot.placementWorkplane, snapshot.placementElevation),
      sketchPlacementWorkplane: normalizePlacementWorkplane(snapshot.sketchPlacementWorkplane),
    };
    const queuedSave = previousSave.catch(() => undefined).then(() => saveProjectShapesWhenIdle(snapshot.projectId, entry, saveContext));
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
          setDashboardNotice(errorText(currentTranslator(), error, "dashboard.storage.saveFailed"));
        }
      })
      .finally(() => {
        if (projectShapeSaveQueuesRef.current[snapshot.projectId] === queuedSave) {
          delete projectShapeSaveQueuesRef.current[snapshot.projectId];
        }
      });
  }, []);

  const updateProjectWorkspace = useCallback((snapshot: {
    projectId: string;
    workspace: WorkplaneWorkspaceSettings;
    snap: GridSize;
    placementElevation?: number;
    placementWorkplane?: PlacementWorkplane;
    sketchPlacementWorkplane?: PlacementWorkplane;
  }) => {
    const version = Math.max(Date.now(), nextProjectRevisionRef.current + 1);
    nextProjectRevisionRef.current = version;
    const workspace = normalizeWorkspaceSettings(snapshot.workspace);
    const snapGrid = normalizeSnapGrid(snapshot.snap);
    const placementElevation = typeof snapshot.placementElevation === "number" && Number.isFinite(snapshot.placementElevation)
      ? snapshot.placementElevation
      : 0;
    const placementWorkplane = normalizePlacementWorkplane(snapshot.placementWorkplane, placementElevation);
    const sketchPlacementWorkplane = normalizePlacementWorkplane(snapshot.sketchPlacementWorkplane);
    const nextFingerprint = `${workplaneSettingsFingerprint(workspace, snapGrid)}:${placementElevation}:${placementWorkplaneFingerprint(placementWorkplane)}:${placementWorkplaneFingerprint(sketchPlacementWorkplane)}`;
    setProjects((current) => {
      let changed = false;
      const next = current.map((project) => {
        if (project.id !== snapshot.projectId) return project;
        const currentFingerprint = `${workplaneSettingsFingerprint(
          normalizeWorkspaceSettings(project.workspace),
          normalizeSnapGrid(project.snapGrid),
        )}:${project.placementElevation ?? 0}:${placementWorkplaneFingerprint(normalizePlacementWorkplane(project.placementWorkplane, project.placementElevation))}:${placementWorkplaneFingerprint(normalizePlacementWorkplane(project.sketchPlacementWorkplane))}`;
        if (currentFingerprint === nextFingerprint) return project;
        changed = true;
        // `revision` tracks the IndexedDB shape snapshot. Advancing it for a
        // workspace-only change can make the loader replace newer live shapes
        // with an older persisted snapshot while autosave is still pending.
        return {
          ...project,
          workspace,
          snapGrid,
          placementElevation,
          placementWorkplane,
          sketchPlacementWorkplane,
          updatedAt: version,
        };
      });
      if (!changed) return current;
      try {
        const storageProjects = mergeProjectsForStorage(next);
        const serialized = JSON.stringify(storageProjects);
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, serialized);
        projectsJsonRef.current = serialized;
        return next;
      } catch {
        return next;
      }
    });
  }, []);

  const createAndOpenProject = (name?: string, challengeTutorial: ChallengeTutorialId | null = null) => {
    const project = newProject(name ?? `Untitled design ${projects.length + 1}`, projects.length);
    setProjectShapesById((current) => ({
      ...current,
      [project.id]: projectShapeCacheEntry(project.revision ?? project.updatedAt, []),
    }));
    void saveProjectShapes(
      project.id,
      projectShapeCacheEntry(project.revision ?? project.updatedAt, []),
      projectShapeSaveContext(project),
    ).catch(() => {
      setDashboardNotice(t("dashboard.storage.prepareFailed"));
    });
    setProjects((current) => [project, ...current]);
    openEditor(project.id, { allowMissingFromStorage: true, challengeTutorial });
  };

  const openSkfProjectFromFile = useCallback(async (file: File, sharedProject?: SharedProject) => {
    setDashboardNotice(t("dashboard.open.validating", { fileName: file.name }));
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
        placementWorkplane: restored.placementWorkplane,
        sketchPlacementWorkplane: restored.sketchPlacementWorkplane,
        sharedProject: sharedProject ? { fileName: sharedProject.fileName, revision: sharedProject.revision } : undefined,
      };
      const entry = projectShapeCacheEntry(now, restored.shapes, restored.history, restored.historyIndex, restored.assets);
      await saveProjectShapes(project.id, entry, projectShapeSaveContext(project));
      setProjectShapesById((current) => ({ ...current, [project.id]: entry }));
      setProjects((current) => [project, ...current]);
      const openedMessage = t("dashboard.open.opened", { fileName: file.name });
      setDashboardNotice(sharedProject ? t("dashboard.shared.openedAutosave", { name: sharedProject.name }) : openedMessage);
      openEditor(project.id, { allowMissingFromStorage: true });
      return {
        ok: true,
        message: notice((t) => sharedProject ? t("dashboard.shared.opened", { name: sharedProject.name }) : t("dashboard.open.opened", { fileName: file.name })),
      };
    } catch (error) {
      setDashboardNotice(errorText(t, error, "dashboard.open.failed"));
      return { ok: false, message: notice((t) => errorText(t, error, "dashboard.open.failed")) };
    }
  }, [projects.length, t]);

  const openSharedProject = useCallback(async (sharedProject: SharedProject) => {
    setDashboardNotice(t("dashboard.shared.opening", { name: sharedProject.name }));
    try {
      const response = await fetch(`/api/shared-projects?fileName=${encodeURIComponent(sharedProject.fileName)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as Partial<ErrorResponseFields>;
        throw errorFromResponse(payload) ?? new Error(t("dashboard.shared.downloadFailed"));
      }
      const revision = response.headers.get("etag")?.replace(/^W\//, "").replace(/^"|"$/g, "") || sharedProject.revision;
      const file = new File([await response.blob()], sharedProject.fileName, { type: "application/vnd.sketchforge.project+zip" });
      await openSkfProjectFromFile(file, { ...sharedProject, revision });
    } catch (error) {
      setDashboardNotice(errorText(t, error, "dashboard.shared.openFailed"));
    }
  }, [openSkfProjectFromFile, t]);

  const deleteSharedProject = useCallback(async (sharedProject: SharedProject) => {
    setDashboardNotice(t("dashboard.shared.deleting", { name: sharedProject.name }));
    try {
      const response = await fetch(`/api/shared-projects?fileName=${encodeURIComponent(sharedProject.fileName)}`, {
        method: "DELETE",
        headers: { "If-Match": `"${sharedProject.revision}"` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as Partial<ErrorResponseFields>;
        throw errorFromResponse(payload) ?? new LocalizedError("errors.shared.deleteFailed");
      }
      setSharedProjects((current) => current.filter((project) => project.fileName !== sharedProject.fileName));
      setDashboardNotice(t("dashboard.shared.deleted", { name: sharedProject.name }));
    } catch (error) {
      setDashboardNotice(errorText(t, error, "errors.shared.deleteFailed"));
      await refreshSharedProjects();
    }
  }, [refreshSharedProjects, t]);

  const saveActiveProjectToShared = useCallback(async ({ exportName, bytes, thumbnailDataUrl }: { exportName: string; bytes: Uint8Array; thumbnailDataUrl: string }) => {
    const activeProject = projects.find((project) => project.id === activeProjectId);
    if (!activeProject) throw new LocalizedError("errors.shared.saveNeedsLocalProject");
    const normalizedExportName = exportName.trim() || activeProject.name;
    const saveBackToSource = Boolean(activeProject.sharedProject && normalizedExportName === activeProject.name);
    const fileName = saveBackToSource && activeProject.sharedProject
      ? activeProject.sharedProject.fileName
      : `${normalizedExportName.replace(/\.skf$/i, "")}.skf`;
    const headers: Record<string, string> = {};
    if (saveBackToSource && activeProject.sharedProject) headers["If-Match"] = `"${activeProject.sharedProject.revision}"`;
    else headers["If-None-Match"] = "*";
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const thumbnailResponse = await fetch(thumbnailDataUrl);
    const thumbnail = await thumbnailResponse.blob();
    if (thumbnail.type !== "image/png" || thumbnail.size === 0) throw new LocalizedError("errors.shared.thumbnailPrepareFailed");
    const formData = new FormData();
    formData.append("project", new Blob([body], { type: "application/vnd.sketchforge.project+zip" }), fileName);
    formData.append("thumbnail", thumbnail, `${fileName}.png`);
    const response = await fetch(`/api/shared-projects?fileName=${encodeURIComponent(fileName)}`, { method: "POST", headers, body: formData });
    const payload = await response.json().catch(() => ({})) as { project?: SharedProject } & Partial<ErrorResponseFields>;
    if (!response.ok || !payload.project) throw errorFromResponse(payload) ?? new LocalizedError("errors.shared.saveFailed");
    const savedProject = payload.project;
    setProjects((current) => current.map((project) => project.id === activeProject.id
      ? { ...project, sharedProject: { fileName: savedProject.fileName, revision: savedProject.revision } }
      : project));
    await refreshSharedProjects();
    return notice((t) => t("dashboard.shared.saved", { name: savedProject.name }));
  }, [activeProjectId, projects, refreshSharedProjects]);

  const importFilesFromDashboard = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const projectFiles = files.filter((file) => /\.skf$/i.test(file.name));
      if (projectFiles.length) {
        if (files.length !== 1) {
          setDashboardNotice(t("dashboard.import.oneSkfAtATime"));
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
        const isObj = sourceFormat === "obj";
        const isSvg = sourceFormat === "svg";
        const isStep = sourceFormat === "step";
        if (!sourceFormat || (!isSvg && !isStep && !importExtensionSupported(file.name))) {
          failures.push({ fileName: file.name, reason: t("dashboard.import.unsupportedType") });
          continue;
        }

        setDashboardNotice(t("dashboard.import.progress", { index: index + 1, count: files.length, fileName: file.name }));
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          const parsedShape = isStep
            ? await import("@/lib/stepImport").then(({ importedShapeFromStep }) => importedShapeFromStep(file.name, buffer))
            : isObj
              ? importedShapeFromObj(file.name, new TextDecoder().decode(bytes))
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
            reason: errorText(t, error, "dashboard.import.readFailed"),
          });
        }
      }

      const failureDetails = failures
        .slice(0, 3)
        .map((failure) => `${failure.fileName}: ${failure.reason}`)
        .join("; ");
      const remainingFailureCount = Math.max(0, failures.length - 3);
      const failureSummary = failures.length
        ? t("dashboard.import.failures", {
          details: remainingFailureCount
            ? t("dashboard.import.failuresMore", { details: failureDetails, count: remainingFailureCount })
            : failureDetails,
        })
        : "";
      const withFailureSummary = (summary: string) => (failureSummary ? `${summary} ${failureSummary}` : summary);

      if (!importedShapes.length) {
        setDashboardNotice(files.length === 1 && failures[0] ? failures[0].reason : withFailureSummary(t("dashboard.import.noneImported", { count: files.length })));
        return;
      }

      try {
        const projectName = importedShapes.length === 1
          ? projectNameFromFileName(importedFileNames[0])
          : `Imported design (${importedShapes.length} files)`;
        const project = newProject(projectName, projects.length, importedShapes.length);
        const revision = project.revision ?? project.updatedAt;
        const entry = projectShapeCacheEntry(revision, importedShapes, undefined, undefined, dedupeProjectAssets(importedAssets));
        await saveProjectShapes(project.id, entry, projectShapeSaveContext(project));
        setProjectShapesById((current) => ({
          ...current,
          [project.id]: entry,
        }));
        const successSummary = importedShapes.length === 1 && files.length === 1
          ? t("dashboard.import.importedOne", { fileName: files[0].name })
          : t("dashboard.import.importedSome", { imported: importedShapes.length, count: files.length });
        setDashboardNotice(withFailureSummary(successSummary));
        setProjects((current) => [project, ...current]);
        openEditor(project.id, { allowMissingFromStorage: true });
      } catch (error) {
        setDashboardNotice(errorText(t, error, "dashboard.import.createProjectFailed"));
      }
    },
    [openSkfProjectFromFile, projects.length, t],
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
    setActiveChallengeTutorial(null);
    setEditorLoading(false);
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
      setDashboardNotice(t("dashboard.storage.deleteFailed"));
    });
  };

  const renameProject = (projectId: string, name: string) => {
    const nextName = name.trim().slice(0, 80);
    if (!nextName) return;
    setProjects((current) =>
      current.map((project) => (project.id === projectId ? { ...project, name: nextName, updatedAt: Date.now() } : project)),
    );
  };

  // React hoists <title> into <head>; it follows the language, unlike static metadata.
  const documentTitle = <title>{t("common.appTitle")}</title>;

  if (!mounted) {
    return documentTitle;
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
      {documentTitle}
      <pre data-codex-projects hidden>
        {JSON.stringify(projectDebugSummary)}
      </pre>
      <input
        ref={dashboardImportInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        accept=".skf,.stl,.obj,.step,.stp,.svg,image/svg+xml"
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
          onStartChallenge={(challenge) => createAndOpenProject(challenge === "nameplate" ? "Personalized Nameplate" : "Key Tag", challenge)}
          onDeleteProject={deleteProject}
          onDeleteSharedProject={(project) => void deleteSharedProject(project)}
          onDownloadFolderChange={setDownloadFolder}
          onDownloadModeChange={setDownloadMode}
          onImportFile={() => dashboardImportInputRef.current?.click()}
          onChallenges={() => {
            setDashboardSection("challenges");
            setDashboardNotice("");
          }}
          onCustomization={() => {
            setDashboardSection("customization");
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
            initialPlacementWorkplane={activeProject?.placementWorkplane}
            onHome={openDashboard}
            onOpenSkfProjectFile={openSkfProjectFromFile}
            onSaveSharedProject={saveActiveProjectToShared}
            onProjectShapesChange={updateProjectShapes}
            onProjectSnapshot={updateProjectSnapshot}
            onProjectWorkspaceChange={updateProjectWorkspace}
            onProjectNameChange={(name) => {
              if (activeProjectId) renameProject(activeProjectId, name);
            }}
            projectId={activeProjectId}
            projectName={activeProject?.name}
            showProjectNameInToolbar={showProjectNameInToolbar}
            onShowProjectNameInToolbarChange={setShowProjectNameInToolbar}
            projectCreatedAt={activeProject?.createdAt}
            projectModifiedAt={activeProject?.updatedAt}
            projectRevision={activeProjectShapeEntry?.revision ?? activeProject?.revision ?? 0}
            sharedProjectsEnabled={sharedProjectsEnabled}
            challengeTutorial={activeChallengeTutorial}
            onChallengeTutorialFinish={() => {
              setActiveChallengeTutorial(null);
              window.localStorage.removeItem(ACTIVE_CHALLENGE_TUTORIAL_STORAGE_KEY);
            }}
            themePreference={themePreference}
            resolvedTheme={resolvedTheme}
            onThemePreferenceChange={setThemePreference}
          />
        </div>
      ) : null}
      {view === "editor" && (editorLoading || !canRenderEditor) ? <EditorLoadingSkeleton /> : null}
    </>
  );
}

function EditorLoadingSkeleton() {
  const t = useTranslations();
  const leftToolbarSections = [
    { className: "home", controls: 1 },
    { className: "clipboard", controls: 4 },
    { className: "history", controls: 2 },
    { className: "shapes", controls: 1 },
  ];
  const rightToolbarSections = [
    { className: "visibility", controls: 2 },
    { className: "combine", controls: 3 },
    { className: "modify", controls: 5 },
    { className: "arrange", controls: 2 },
    { className: "manage", controls: 3 },
  ];

  const renderToolbarSection = ({ className, controls }: { className: string; controls: number }) => (
    <div className={`editor-loading-tool-section ${className}`} key={className}>
      <span className="editor-loading-section-label editor-skeleton-shimmer" />
      <div className="editor-loading-section-controls">
        {Array.from({ length: controls }, (_, index) => (
          <span className="editor-loading-tool editor-skeleton-shimmer" key={index} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="editor-loading-screen" role="status" aria-label={t("dashboard.loading.editor")} aria-live="polite">
      <div className="editor-loading-toolbar">
        <div className="editor-loading-tabs">
          <span className="editor-skeleton-shimmer" />
          <span className="editor-skeleton-shimmer" />
        </div>
        <div className="editor-loading-tool-groups">
          <div className="editor-loading-tool-cluster">
            {leftToolbarSections.map(renderToolbarSection)}
          </div>
          <span className="editor-loading-toolbar-spacer" />
          <div className="editor-loading-tool-cluster">
            {rightToolbarSections.map(renderToolbarSection)}
          </div>
        </div>
      </div>

      <div className="editor-loading-body">
        <div className="editor-loading-viewport">
          <div className="editor-loading-view-cube">
            <span className="editor-loading-cube-top editor-skeleton-shimmer" />
            <span className="editor-loading-cube-left editor-skeleton-shimmer" />
            <span className="editor-loading-cube-right editor-skeleton-shimmer" />
          </div>
          <div className="editor-loading-model" aria-hidden="true">
            <span className="editor-loading-model-top editor-skeleton-shimmer" />
            <span className="editor-loading-model-front editor-skeleton-shimmer" />
            <span className="editor-loading-model-side editor-skeleton-shimmer" />
          </div>
          <div className="editor-loading-viewport-controls">
            {Array.from({ length: 5 }, (_, index) => (
              <span className="editor-skeleton-shimmer" key={index} />
            ))}
          </div>
          <span className="editor-loading-status editor-skeleton-shimmer" />
          <span className="editor-loading-snap editor-skeleton-shimmer" />
        </div>
      </div>
    </div>
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
  onStartChallenge,
  onDeleteProject,
  onDeleteSharedProject,
  onDownloadFolderChange,
  onDownloadModeChange,
  onImportFile,
  onChallenges,
  onCustomization,
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
  onStartChallenge: (challenge: ChallengeTutorialId) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteSharedProject: (project: SharedProject) => void;
  onDownloadFolderChange: (value: string) => void;
  onDownloadModeChange: (value: DownloadMode) => void;
  onImportFile: () => void;
  onChallenges: () => void;
  onCustomization: () => void;
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
  const t = useTranslations();
  const locale = useLocale();
  const [languagePreference, setLanguagePreference] = useLanguagePreference();
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [openSharedProjectMenuFileName, setOpenSharedProjectMenuFileName] = useState<string | null>(null);
  const [projectPendingDeleteId, setProjectPendingDeleteId] = useState<string | null>(null);
  const [sharedProjectPendingDeleteFileName, setSharedProjectPendingDeleteFileName] = useState<string | null>(null);
  const [projectPendingRenameId, setProjectPendingRenameId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [desktopAppVersion, setDesktopAppVersion] = useState<string | null>(null);
  const [desktopUpdaterConnected, setDesktopUpdaterConnected] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);
  const [updateKey, setUpdateKey] = useState("");
  const [updateStarting, setUpdateStarting] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const updateCheckedRef = useRef(false);
  const projectPendingDelete = projects.find((project) => project.id === projectPendingDeleteId) ?? null;
  const sharedProjectPendingDelete = sharedProjects.find((project) => project.fileName === sharedProjectPendingDeleteFileName) ?? null;
  const projectPendingRename = projects.find((project) => project.id === projectPendingRenameId) ?? null;

  useEffect(() => {
    const desktop = window.sketchforgeDesktop;
    if (!desktop) return;
    setDesktopUpdaterConnected(true);
    void desktop.getVersion().then(setDesktopAppVersion).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!projectPendingDeleteId) return;
    if (projects.some((project) => project.id === projectPendingDeleteId)) return;
    setProjectPendingDeleteId(null);
  }, [projectPendingDeleteId, projects]);

  useEffect(() => {
    if (!sharedProjectPendingDeleteFileName) return;
    if (sharedProjects.some((project) => project.fileName === sharedProjectPendingDeleteFileName)) return;
    setSharedProjectPendingDeleteFileName(null);
  }, [sharedProjectPendingDeleteFileName, sharedProjects]);

  const confirmProjectDelete = () => {
    if (!projectPendingDelete) return;
    onDeleteProject(projectPendingDelete.id);
    setProjectPendingDeleteId(null);
  };

  const confirmSharedProjectDelete = () => {
    if (!sharedProjectPendingDelete) return;
    onDeleteSharedProject(sharedProjectPendingDelete);
    setSharedProjectPendingDeleteFileName(null);
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

  const checkForUpdates = useCallback(async (force: boolean, alwaysPrompt: boolean) => {
    if (staticExportBuild) return;
    setUpdateChecking(true);
    setUpdateMessage("");
    try {
      const desktop = window.sketchforgeDesktop;
      if (desktop) {
        setDesktopUpdaterConnected(true);
        const result = await desktop.checkForUpdates();
        setDesktopAppVersion(result.currentVersion);
        if (result.error) throw new Error(result.error);
        const payload: AppUpdateStatus = {
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          updateAvailable: result.updateAvailable,
          checkedAt: result.checkedAt,
          updateUrl: "",
          installationReady: true,
          requiresUpdateKey: false,
          updateMode: "desktop",
        };
        setUpdateStatus(payload);
        if (result.updateAvailable && result.latestVersion) {
          setUpdateMessage(
            result.downloaded
              ? t("dashboard.updates.readyToInstall", { version: result.latestVersion })
              : t("dashboard.updates.availableDesktop", { version: result.latestVersion }),
          );
        } else if (alwaysPrompt) {
          setUpdateMessage(t("dashboard.updates.upToDate"));
        }
        return;
      }

      const response = await fetch(`/api/app-update${force ? "?force=1" : ""}`, { cache: "no-store" });
      const payload = await response.json() as AppUpdateStatus & Partial<ErrorResponseFields>;
      if (!response.ok) throw errorFromResponse(payload) ?? new LocalizedError("errors.update.checkFailed");
      setUpdateStatus(payload);
      if (payload.updateAvailable && payload.latestVersion) {
        const dismissedVersion = window.localStorage.getItem(DISMISSED_UPDATE_VERSION_STORAGE_KEY);
        if (alwaysPrompt || dismissedVersion !== payload.latestVersion) {
          onCloseSettings();
          setUpdatePromptOpen(true);
        }
      } else if (alwaysPrompt && !payload.checkError) {
        setUpdateMessage(t("dashboard.updates.upToDate"));
      }
    } catch (error) {
      setUpdateMessage(errorText(t, error, "errors.update.checkFailed"));
    } finally {
      setUpdateChecking(false);
    }
  }, [onCloseSettings, staticExportBuild, t]);

  useEffect(() => {
    if (staticExportBuild || updateCheckedRef.current) return;
    updateCheckedRef.current = true;
    void checkForUpdates(false, false);
  }, [checkForUpdates, staticExportBuild]);

  const dismissUpdate = () => {
    if (updateStatus?.latestVersion) {
      window.localStorage.setItem(DISMISSED_UPDATE_VERSION_STORAGE_KEY, updateStatus.latestVersion);
    }
    setUpdatePromptOpen(false);
    setUpdateKey("");
    setUpdateMessage("");
  };

  const requestUpdate = async () => {
    if (!updateStatus?.updateAvailable) return;

    const desktop = window.sketchforgeDesktop;
    if (desktop) {
      setUpdateStarting(true);
      setUpdateMessage(
        updateStatus.latestVersion
          ? t("dashboard.updates.downloadingVersion", { version: updateStatus.latestVersion })
          : t("dashboard.updates.downloadingUpdate"),
      );
      try {
        const result = await desktop.installUpdate();
        if (result.error) throw new Error(result.error);
        if (!result.updateAvailable) {
          setUpdateStatus({
            currentVersion: result.currentVersion,
            latestVersion: result.latestVersion,
            updateAvailable: false,
            checkedAt: result.checkedAt,
            updateUrl: "",
            installationReady: true,
            requiresUpdateKey: false,
            updateMode: "desktop",
          });
          setUpdateMessage(t("dashboard.updates.alreadyUpToDate"));
        } else {
          setUpdateMessage(t("dashboard.updates.restartingToInstall"));
        }
      } catch (error) {
        setUpdateMessage(errorText(t, error, "dashboard.updates.installFailed"));
      } finally {
        setUpdateStarting(false);
      }
      return;
    }

    if (!updateStatus.installationReady) {
      window.open(updateStatus.updateUrl, "_blank", "noopener,noreferrer");
      dismissUpdate();
      return;
    }
    if (updateStatus.requiresUpdateKey && !updateKey.trim()) {
      setUpdateMessage(t("dashboard.updates.keyRequired"));
      return;
    }

    setUpdateStarting(true);
    setUpdateMessage("");
    try {
      const response = await fetch("/api/app-update", {
        method: "POST",
        headers: { "x-sketchforge-update-key": updateKey.trim() },
      });
      const payload = await response.json() as { accepted?: boolean; updateUrl?: string; updateMode?: "local" | "server"; restartRequired?: boolean } & Partial<ErrorResponseFields>;
      if (!response.ok || !payload.accepted) throw errorFromResponse(payload) ?? new LocalizedError("errors.update.startFailed");
      if (updateStatus.latestVersion) {
        window.localStorage.setItem(DISMISSED_UPDATE_VERSION_STORAGE_KEY, updateStatus.latestVersion);
      }
      setUpdateKey("");
      if (payload.updateMode === "local" || updateStatus.updateMode === "local") {
        const expectedVersion = updateStatus.latestVersion;
        setUpdateMessage(t("dashboard.updates.localRestarting"));
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        for (let attempt = 0; attempt < 60; attempt += 1) {
          try {
            const statusResponse = await fetch("/api/app-update?force=1", { cache: "no-store" });
            if (statusResponse.ok) {
              const statusPayload = await statusResponse.json() as AppUpdateStatus;
              if (!expectedVersion || statusPayload.currentVersion === expectedVersion || !statusPayload.updateAvailable) {
                window.location.reload();
                return;
              }
            }
          } catch {
            // The local dev server is expected to be briefly unavailable while it restarts.
          }
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
        setUpdateMessage(t("dashboard.updates.localReload"));
      } else {
        setUpdateMessage(t("dashboard.updates.serverStarted"));
      }
    } catch (error) {
      setUpdateMessage(errorText(t, error, "errors.update.startFailed"));
    } finally {
      setUpdateStarting(false);
    }
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <a className="dashboard-brand" href="./" aria-label={t("dashboard.topbar.homeLink")}>
          <img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" />
          <span>SketchForge</span>
        </a>
        <div className="dashboard-search">
          <Search size={18} strokeWidth={2.4} />
          <input value={query} onChange={(event) => onQueryChange(event.currentTarget.value)} placeholder={t("dashboard.topbar.search")} aria-label={t("dashboard.topbar.search")} />
        </div>
        <button className="dashboard-primary" type="button" onClick={onCreate}>
          <Plus size={20} strokeWidth={2.6} />
          <span>{t("dashboard.topbar.create")}</span>
        </button>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="dashboard-nav-stack">
            <button className={`dashboard-nav-item ${dashboardSection === "home" ? "active" : ""}`} type="button" aria-label={t("dashboard.nav.home")} title={t("dashboard.nav.home")} onClick={onDashboardHome}>
              <HomeIcon size={20} />
              <span>{t("dashboard.nav.home")}</span>
            </button>
            {sharedProjectsEnabled ? (
              <button className={`dashboard-nav-item ${dashboardSection === "shared" ? "active" : ""}`} type="button" aria-label={t("dashboard.shared.title")} title={t("dashboard.shared.title")} onClick={onSharedProjects}>
                <FolderKanban size={20} />
                <span>{t("dashboard.nav.shared")}</span>
              </button>
            ) : null}
            <button className={`dashboard-nav-item ${dashboardSection === "challenges" ? "active" : ""}`} type="button" aria-label={t("dashboard.nav.challenges")} title={t("dashboard.nav.challenges")} onClick={onChallenges}>
              <SlidersHorizontal size={20} />
              <span>{t("dashboard.nav.challenges")}</span>
            </button>
            <button className={`dashboard-nav-item ${dashboardSection === "customization" ? "active" : ""}`} type="button" aria-label={t("dashboard.nav.customization")} title={t("dashboard.nav.customization")} onClick={onCustomization}>
              <Palette size={20} />
              <span>{t("dashboard.nav.customization")}</span>
            </button>
          </div>
          <div className="dashboard-sidebar-footer">
            <button className="dashboard-nav-item dashboard-settings-button" type="button" aria-label={t("dashboard.settings.title")} title={t("dashboard.settings.title")} onClick={onOpenSettings}>
              <Settings size={20} />
              <span>{t("dashboard.settings.title")}</span>
            </button>
          </div>
        </aside>

        <section
          className="dashboard-main"
          aria-label={t(
            dashboardSection === "challenges"
              ? "dashboard.nav.challenges"
              : dashboardSection === "shared"
                ? "dashboard.shared.title"
                : dashboardSection === "customization"
                  ? "dashboard.nav.customization"
                  : "dashboard.nav.dashboard",
          )}
        >
          {dashboardSection === "challenges" ? (
            <ChallengesDashboard onStartChallenge={onStartChallenge} />
          ) : dashboardSection === "customization" ? (
            <div className="dashboard-coming-soon" role="status">
              <strong>{t("dashboard.customization.comingSoon")}</strong>
            </div>
          ) : dashboardSection === "shared" ? (
            <>
              {dashboardNotice ? <div className="dashboard-import-notice" role="status">{dashboardNotice}</div> : null}
              <div className="dashboard-section-header shared-projects-header">
                <div>
                  <h1>{t("dashboard.shared.title")}</h1>
                  <span>{t("dashboard.shared.available", { count: sharedProjects.length })}</span>
                </div>
                <button className="shared-projects-refresh" type="button" onClick={onRefreshSharedProjects} disabled={sharedProjectsLoading}>
                  <RefreshCw size={16} className={sharedProjectsLoading ? "spinning" : undefined} />
                  <span>{t("dashboard.shared.refresh")}</span>
                </button>
              </div>
              {sharedProjects.length > 0 ? (
                <div className={viewMode === "grid" ? "project-grid" : "project-list"}>
                  {sharedProjects.map((project, index) => (
                    <article className="project-card shared-project-card" key={project.fileName}>
                      <button className="project-card-open" type="button" onClick={() => onOpenSharedProject(project)}>
                        <ProjectPreview accent={PROJECT_ACCENTS[index % PROJECT_ACCENTS.length]} thumbnailUrl={project.thumbnailUrl} />
                        <span className="project-card-title">{project.name}</span>
                        <span className="project-card-meta">{formatUpdated(t, locale, project.updatedAt)} - {formatFileSize(t, locale, project.size)}</span>
                      </button>
                      <span className="shared-project-badge">{t("dashboard.shared.badge")}</span>
                      <button
                        className="project-menu-trigger"
                        type="button"
                        aria-label={t("dashboard.shared.optionsFor", { name: project.name })}
                        aria-expanded={openSharedProjectMenuFileName === project.fileName}
                        title={t("dashboard.shared.options")}
                        onClick={() => {
                          setOpenProjectMenuId(null);
                          setOpenSharedProjectMenuFileName((current) => (current === project.fileName ? null : project.fileName));
                        }}
                      >
                        <EllipsisVertical size={19} strokeWidth={2.5} />
                      </button>
                      {openSharedProjectMenuFileName === project.fileName ? (
                        <div className="project-card-menu" role="menu" aria-label={t("dashboard.shared.menuFor", { name: project.name })}>
                          <button
                            className="delete"
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenSharedProjectMenuFileName(null);
                              setSharedProjectPendingDeleteFileName(project.fileName);
                            }}
                          >
                            <Trash2 size={16} />
                            <span>{t("dashboard.button.delete")}</span>
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="project-empty">
                  <strong>{sharedProjectsLoading ? t("dashboard.shared.loading") : t("dashboard.shared.empty")}</strong>
                  <span>{t("dashboard.shared.emptyHint")}</span>
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
                  <span>{t("dashboard.actions.create")}</span>
                </button>
                <button className="dashboard-action-tile" type="button" onClick={onImportFile}>
                  <span className="dashboard-action-icon">
                    <FileUp size={24} strokeWidth={2.4} />
                  </span>
                  <span>{t("dashboard.actions.import")}</span>
                </button>
                <button className="dashboard-action-tile" type="button" onClick={onWorkspace}>
                  <span className="dashboard-action-icon">
                    <Clock3 size={24} strokeWidth={2.4} />
                  </span>
                  <span>{t("dashboard.actions.continue")}</span>
                </button>
              </div>
              {dashboardNotice ? (
                <div className="dashboard-import-notice" role="status">
                  {dashboardNotice}
                </div>
              ) : null}

              <div className="dashboard-section-header">
                <div>
                  <h1>{t("dashboard.projects.title")}</h1>
                  <span>{t("dashboard.projects.visible", { count: projects.length })}</span>
                </div>
                <div className="dashboard-controls">
                  <label className="dashboard-select">
                    <SlidersHorizontal size={17} />
                    <select value={sortMode} onChange={(event) => onSortModeChange(event.currentTarget.value)} aria-label={t("dashboard.projects.sort")}>
                      <option value="recent">{t("dashboard.projects.sortRecent")}</option>
                      <option value="name">{t("dashboard.projects.sortName")}</option>
                    </select>
                  </label>
                  <div className="dashboard-segmented" aria-label={t("dashboard.projects.view")}>
                    <button className={viewMode === "grid" ? "active" : ""} type="button" aria-label={t("dashboard.projects.gridView")} onClick={() => onViewModeChange("grid")}>
                      <Grid3X3 size={17} />
                    </button>
                    <button className={viewMode === "list" ? "active" : ""} type="button" aria-label={t("dashboard.projects.listView")} onClick={() => onViewModeChange("list")}>
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
                          {formatUpdated(t, locale, project.updatedAt)} - {t("dashboard.projects.shapeCount", { count: project.shapes })}
                        </span>
                      </button>
                      <button
                        className="project-menu-trigger"
                        type="button"
                        aria-label={t("dashboard.projects.optionsFor", { name: project.name })}
                        aria-expanded={openProjectMenuId === project.id}
                        title={t("dashboard.projects.options")}
                        onClick={() => {
                          setOpenSharedProjectMenuFileName(null);
                          setOpenProjectMenuId((current) => (current === project.id ? null : project.id));
                        }}
                      >
                        <EllipsisVertical size={19} strokeWidth={2.5} />
                      </button>
                      {openProjectMenuId === project.id ? (
                        <div className="project-card-menu" role="menu" aria-label={t("dashboard.projects.menuFor", { name: project.name })}>
                          <button type="button" role="menuitem" onClick={() => startProjectRename(project)}>
                            <Pencil size={16} />
                            <span>{t("dashboard.projects.rename")}</span>
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
                            <span>{t("dashboard.button.delete")}</span>
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="project-empty">
                  <strong>{t("dashboard.projects.empty")}</strong>
                  <span>{t("dashboard.projects.emptyHint")}</span>
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
              <strong id="delete-project-title">{t("dashboard.projects.deleteTitle")}</strong>
              <button type="button" aria-label={t("dashboard.projects.deleteCancel")} onClick={() => setProjectPendingDeleteId(null)}>
                <X size={18} />
              </button>
            </header>
            <p>{t.rich("dashboard.projects.deleteConfirm", { name: projectPendingDelete.name, b: (chunks) => <span>{chunks}</span> })}</p>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={() => setProjectPendingDeleteId(null)}>
                {t("dashboard.button.cancel")}
              </button>
              <button className="dashboard-confirm-delete" type="button" onClick={confirmProjectDelete}>
                {t("dashboard.button.delete")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {sharedProjectPendingDelete ? (
        <section className="dashboard-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-shared-project-title">
          <div className="dashboard-confirm-dialog">
            <header>
              <strong id="delete-shared-project-title">{t("dashboard.shared.deleteTitle")}</strong>
              <button type="button" aria-label={t("dashboard.shared.deleteCancel")} onClick={() => setSharedProjectPendingDeleteFileName(null)}>
                <X size={18} />
              </button>
            </header>
            <p>{t.rich("dashboard.shared.deleteConfirm", { name: sharedProjectPendingDelete.name, b: (chunks) => <span>{chunks}</span> })}</p>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={() => setSharedProjectPendingDeleteFileName(null)}>
                {t("dashboard.button.cancel")}
              </button>
              <button className="dashboard-confirm-delete" type="button" onClick={confirmSharedProjectDelete}>
                {t("dashboard.button.delete")}
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
              <strong id="rename-project-title">{t("dashboard.projects.renameTitle")}</strong>
              <button type="button" aria-label={t("dashboard.projects.renameCancel")} onClick={closeProjectRename}>
                <X size={18} />
              </button>
            </header>
            <label>
              <span>{t("dashboard.projects.nameLabel")}</span>
              <input
                autoFocus
                maxLength={80}
                value={projectNameDraft}
                onChange={(event) => setProjectNameDraft(event.currentTarget.value)}
                aria-label={t("dashboard.projects.nameLabel")}
              />
            </label>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={closeProjectRename}>
                {t("dashboard.button.cancel")}
              </button>
              <button className="dashboard-confirm-save" type="submit" disabled={!projectNameDraft.trim()}>
                {t("dashboard.button.save")}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {updatePromptOpen && updateStatus?.updateAvailable && updateStatus.latestVersion ? (
        <section className="dashboard-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
          <div className="dashboard-confirm-dialog dashboard-update-dialog">
            <header>
              <strong id="app-update-title">{t("dashboard.updates.promptTitle", { version: updateStatus.latestVersion })}</strong>
              <button type="button" aria-label={t("dashboard.updates.dismiss")} onClick={dismissUpdate} disabled={updateStarting}>
                <X size={18} />
              </button>
            </header>
            <div className="dashboard-update-copy">
              <p>{t("dashboard.updates.promptQuestion", { version: updateStatus.currentVersion })}</p>
              <div className="dashboard-update-safety">
                {updateStatus.updateMode === "local"
                  ? t("dashboard.updates.safetyLocal")
                  : t.rich("dashboard.updates.safetyServer", { code: (chunks) => <code>{chunks}</code> })}
              </div>
              {!updateStatus.installationReady ? (
                <div className="dashboard-update-note">{t("dashboard.updates.notConfigured")}</div>
              ) : null}
              {updateStatus.requiresUpdateKey ? (
                <label className="dashboard-update-key">
                  <span>{t("dashboard.updates.keyLabel")}</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={updateKey}
                    onChange={(event) => setUpdateKey(event.currentTarget.value)}
                    disabled={updateStarting}
                  />
                </label>
              ) : null}
              {updateMessage ? <div className="dashboard-update-message" role="status">{updateMessage}</div> : null}
            </div>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={dismissUpdate} disabled={updateStarting}>
                {t("dashboard.updates.notNow")}
              </button>
              <button className="dashboard-confirm-save" type="button" onClick={() => void requestUpdate()} disabled={updateStarting}>
                {updateStarting
                  ? t("dashboard.updates.starting")
                  : updateStatus.installationReady
                    ? t("dashboard.updates.update")
                    : t("dashboard.updates.openGuide")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {settingsOpen ? (
        <section className="dashboard-settings-panel" role="dialog" aria-modal="true" aria-label={t("dashboard.settings.title")}>
          <header>
            <strong>{t("dashboard.settings.title")}</strong>
            <button type="button" aria-label={t("dashboard.settings.close")} onClick={onCloseSettings}>
              <X size={18} />
            </button>
          </header>
          <label className="dashboard-setting-row">
            <span>{t("common.language.label")}</span>
            <select
              value={languagePreference}
              onChange={(event) => setLanguagePreference(normalizeLanguagePreference(event.currentTarget.value))}
            >
              {LANGUAGE_PREFERENCE_OPTIONS.map((preference) => (
                <option key={preference} value={preference}>
                  {languagePreferenceLabel(t, preference)}
                </option>
              ))}
            </select>
          </label>
          <label className="dashboard-setting-row">
            <span>{t("dashboard.settings.saveMethod")}</span>
            <select
              value={downloadMode}
              onChange={(event) => onDownloadModeChange(!staticExportBuild && event.currentTarget.value === "folder" ? "folder" : "browser")}
            >
              <option value="browser">{t("dashboard.settings.browserDownloads")}</option>
              {!staticExportBuild ? <option value="folder">{t("dashboard.settings.saveToFolder")}</option> : null}
            </select>
          </label>
          <label className="dashboard-setting-row">
            <span>{t("dashboard.settings.folderPath")}</span>
            <input
              disabled={staticExportBuild || downloadMode !== "folder"}
              value={downloadFolder}
              onChange={(event) => onDownloadFolderChange(event.currentTarget.value)}
              placeholder="C:\\Users\\username\\Downloads"
            />
          </label>
          <div className="dashboard-version-row">
            <span>{t("dashboard.settings.version")}</span>
            <strong>{desktopAppVersion ?? updateStatus?.currentVersion ?? SKF_CREATED_WITH_VERSION}</strong>
          </div>
          <section className="dashboard-update-settings" aria-label={t("dashboard.updates.sectionTitle")}>
            <div>
              <strong>{t("dashboard.updates.sectionTitle")}</strong>
              <span>{t("dashboard.updates.sectionNote")}</span>
            </div>
            {staticExportBuild ? (
              <span className="dashboard-update-status">{t("dashboard.updates.managed")}</span>
            ) : updateStatus?.checkError ? (
              <span className="dashboard-update-status error">
                {errorText(t, errorFromPayload({ message: updateStatus.checkError, errorKey: updateStatus.checkErrorKey, errorParams: updateStatus.checkErrorParams }), "errors.update.checkFailed")}
              </span>
            ) : desktopUpdaterConnected && updateStatus?.updateAvailable && updateStatus.latestVersion ? (
              <button
                className="dashboard-update-available"
                type="button"
                onClick={() => void requestUpdate()}
                disabled={updateStarting}
              >
                {updateStarting ? t("dashboard.updates.downloading") : t("dashboard.updates.updateTo", { version: updateStatus.latestVersion })}
              </button>
            ) : updateStatus?.updateAvailable && updateStatus.latestVersion ? (
              <button
                className="dashboard-update-available"
                type="button"
                onClick={() => {
                  onCloseSettings();
                  setUpdateMessage("");
                  setUpdatePromptOpen(true);
                }}
              >
                {t("dashboard.updates.updateTo", { version: updateStatus.latestVersion })}
              </button>
            ) : updateStatus ? (
              <span className="dashboard-update-status ready">{t("dashboard.updates.upToDateStatus")}</span>
            ) : null}
            {!staticExportBuild ? (
              <button className="dashboard-check-update" type="button" onClick={() => void checkForUpdates(true, true)} disabled={updateChecking}>
                <RefreshCw size={15} className={updateChecking ? "spin" : ""} />
                <span>{updateChecking ? t("dashboard.updates.checking") : t("dashboard.updates.check")}</span>
              </button>
            ) : null}
            {updateMessage && settingsOpen ? <span className="dashboard-update-status" role="status">{updateMessage}</span> : null}
          </section>
          <div className="dashboard-version-row">
            <span>{t("dashboard.settings.license")}</span>
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">AGPLv3</a>
          </div>
          <div className="dashboard-version-row">
            <span>{t("dashboard.settings.source")}</span>
            <a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer">{t("dashboard.settings.viewSource")}</a>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ProjectPreview({ accent, thumbnailUrl }: { accent: DashboardProject["accent"]; thumbnailUrl?: string | null }) {
  const t = useTranslations();
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
          <span className="preview-empty-mark">{t("dashboard.projects.noSnapshot")}</span>
        </>
      )}
    </span>
  );
}
