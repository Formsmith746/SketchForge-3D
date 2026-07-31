"use client";

import {
  Clock3,
  Download,
  EllipsisVertical,
  FileUp,
  Grid3X3,
  HomeIcon,
  List,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImportProgressBar } from "@/components/ImportProgressBar";
import {
  cloudFetch,
  formatBytes,
  formatUnixDate,
  getCloudStatus,
  type CloudProjectSummary,
  type CloudStatus,
} from "@/lib/cloudApi";
import type { FileImportProgress } from "@/lib/fileImportProgress";

type DashboardSection = "home" | "challenges";
type ViewMode = "grid" | "list";

type CloudHomeDashboardProps = {
  projectBusy?: boolean;
  importProgress?: FileImportProgress | null;
  notice: string;
  projects: CloudProjectSummary[];
  status: CloudStatus;
  onContinueProject: () => void;
  onCreateProject: () => void;
  onDeleteProject: (project: CloudProjectSummary) => Promise<void>;
  onImportProject: (file: File) => Promise<void>;
  onOpenProject: (project: CloudProjectSummary) => Promise<void>;
  onRenameProject: (project: CloudProjectSummary, name: string) => Promise<void>;
  onStatusChange: (status: CloudStatus) => void;
};

function formatUpdated(timestamp: number) {
  const age = Date.now() - timestamp * 1000;
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return `${Math.max(1, Math.round(age / 60_000))} min ago`;
  if (age < 86_400_000) return "Today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp * 1000));
}

function projectAccent(project: CloudProjectSummary) {
  const accents = ["cyan", "green", "gold", "red"] as const;
  let value = 0;
  for (const character of project.id) value = (value + character.charCodeAt(0)) % accents.length;
  return accents[value];
}

function CloudProjectPreview({ project }: { project: CloudProjectSummary }) {
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const showThumbnail = project.thumbnailVersion !== null && failedVersion !== project.thumbnailVersion;
  return (
    <span className={`project-preview accent-${projectAccent(project)}`} aria-hidden="true">
      <span className="preview-grid" />
      {showThumbnail ? (
        <img
          className="project-thumbnail-image"
          src={`/api/cloud/projects/${project.id}/thumbnail?v=${project.thumbnailVersion}`}
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailedVersion(project.thumbnailVersion)}
        />
      ) : <span className="preview-empty-mark">Preview pending</span>}
    </span>
  );
}

export default function CloudHomeDashboard({
  projectBusy = false,
  importProgress = null,
  notice,
  projects,
  status,
  onContinueProject,
  onCreateProject,
  onDeleteProject,
  onImportProject,
  onOpenProject,
  onRenameProject,
  onStatusChange,
}: CloudHomeDashboardProps) {
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>("home");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [projectPendingDeleteId, setProjectPendingDeleteId] = useState<string | null>(null);
  const [projectPendingRenameId, setProjectPendingRenameId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteWord, setDeleteWord] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? projects.filter((project) => project.name.toLowerCase().includes(normalizedQuery))
      : projects;
    return sortMode === "name"
      ? [...filtered].sort((left, right) => left.name.localeCompare(right.name))
      : [...filtered].sort((left, right) => right.updatedAt - left.updatedAt);
  }, [projects, query, sortMode]);

  const projectPendingDelete = projects.find((project) => project.id === projectPendingDeleteId) ?? null;
  const projectPendingRename = projects.find((project) => project.id === projectPendingRenameId) ?? null;
  const statusLabel = status.subscription.status.replaceAll("_", " ") || "inactive";
  const usagePercent = Math.min(
    100,
    status.storage.quotaBytes ? (status.storage.usedBytes / status.storage.quotaBytes) * 100 : 0,
  );

  useEffect(() => {
    if (!settingsOpen) return;
    let cancelled = false;
    void getCloudStatus()
      .then((nextStatus) => {
        if (!cancelled) onStatusChange(nextStatus);
      })
      .catch(() => {
        if (!cancelled) setMessage("Account information could not be refreshed.");
      });
    return () => {
      cancelled = true;
    };
  }, [onStatusChange, settingsOpen]);

  useEffect(() => {
    if (projectPendingDeleteId && !projects.some((project) => project.id === projectPendingDeleteId)) {
      setProjectPendingDeleteId(null);
    }
  }, [projectPendingDeleteId, projects]);

  useEffect(() => {
    if (!openProjectMenuId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-project-menu-root]")) return;
      setOpenProjectMenuId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenProjectMenuId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openProjectMenuId]);

  useEffect(() => {
    if (openProjectMenuId && !visibleProjects.some((project) => project.id === openProjectMenuId)) {
      setOpenProjectMenuId(null);
    }
  }, [openProjectMenuId, visibleProjects]);

  const openPortal = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await cloudFetch<{ url: string }>("/api/cloud/billing/portal", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the Stripe billing portal.");
      setBusy(false);
    }
  };

  const exportAccount = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await cloudFetch<Record<string, unknown>>("/api/cloud/account/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sketchforge-cloud-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Account export downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export account data.");
    } finally {
      setBusy(false);
    }
  };

  const requestDeletion = async () => {
    setBusy(true);
    setMessage("");
    try {
      await cloudFetch<{ status: string }>("/api/cloud/account/delete-request", {
        method: "POST",
        body: JSON.stringify({ email: deleteEmail, confirmation: deleteWord }),
      });
      window.location.replace("/cloud");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the deletion request.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await cloudFetch<{ ok: true }>("/api/cloud/auth/logout", { method: "POST", body: JSON.stringify({}) });
      window.location.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
      setBusy(false);
    }
  };

  const startProjectRename = (project: CloudProjectSummary) => {
    setOpenProjectMenuId(null);
    setProjectPendingRenameId(project.id);
    setProjectNameDraft(project.name);
  };

  const confirmProjectRename = async () => {
    if (projectBusy || !projectPendingRename || !projectNameDraft.trim()) return;
    setMessage("");
    try {
      await onRenameProject(projectPendingRename, projectNameDraft.trim());
      setProjectPendingRenameId(null);
      setProjectNameDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rename the project.");
    }
  };

  return (
    <main className="dashboard-shell cloud-dashboard-shell">
      <input
        ref={importInputRef}
        className="hidden-file-input"
        type="file"
        accept=".skf,.stl,.step,.stp,.svg,image/svg+xml"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file && !projectBusy) {
            void onImportProject(file).catch((error) => setMessage(error instanceof Error ? error.message : "Could not import the project."));
          }
          event.currentTarget.value = "";
        }}
      />

      <header className="dashboard-topbar">
        <button className="dashboard-brand" type="button" aria-label="Home" onClick={() => setDashboardSection("home")}>
          <img src="/assets/sketchforge/sketchforge-logo.png" alt="" />
          <span>SketchForge Cloud</span>
        </button>
        <div className="dashboard-search">
          <Search size={18} strokeWidth={2.4} />
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search projects" aria-label="Search projects" />
        </div>
        <button className="dashboard-primary" type="button" disabled={projectBusy} onClick={onCreateProject}>
          <Plus size={20} strokeWidth={2.6} />
          <span>Create</span>
        </button>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="dashboard-nav-stack">
            <button className={`dashboard-nav-item ${dashboardSection === "home" ? "active" : ""}`} type="button" onClick={() => setDashboardSection("home")}>
              <HomeIcon size={20} />
              <span>Home</span>
            </button>
            <button className={`dashboard-nav-item ${dashboardSection === "challenges" ? "active" : ""}`} type="button" onClick={() => setDashboardSection("challenges")}>
              <SlidersHorizontal size={20} />
              <span>Challenges</span>
            </button>
          </div>
          <button className="dashboard-nav-item dashboard-settings-button" type="button" aria-label="Account and app settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </aside>

        <section className="dashboard-main" aria-label={dashboardSection === "challenges" ? "Challenges" : "Dashboard"}>
          {dashboardSection === "challenges" ? (
            <div className="dashboard-coming-soon" role="status"><strong>Coming soon</strong></div>
          ) : (
            <>
              <div className="dashboard-actions-band">
                <button className="dashboard-action-tile create" type="button" disabled={projectBusy} onClick={onCreateProject}>
                  <span className="dashboard-action-icon"><Plus size={25} strokeWidth={2.8} /></span>
                  <span>Create new 3D design</span>
                </button>
                <button className="dashboard-action-tile" type="button" disabled={projectBusy} onClick={() => importInputRef.current?.click()}>
                  <span className="dashboard-action-icon"><FileUp size={24} strokeWidth={2.4} /></span>
                  <span>Import SKF/STL/STEP/SVG</span>
                </button>
                <button className="dashboard-action-tile" type="button" disabled={projectBusy || !projects.length} onClick={onContinueProject}>
                  <span className="dashboard-action-icon"><Clock3 size={24} strokeWidth={2.4} /></span>
                  <span>Continue workplane</span>
                </button>
              </div>

              {importProgress ? <ImportProgressBar progress={importProgress} className="dashboard-file-import-progress" /> : null}
              {notice ? <div className="dashboard-import-notice" role="status">{notice}</div> : null}

              <div className="dashboard-section-header">
                <div><h1>Projects</h1><span>{visibleProjects.length} visible</span></div>
                <div className="dashboard-controls">
                  <label className="dashboard-select">
                    <SlidersHorizontal size={17} />
                    <select value={sortMode} onChange={(event) => setSortMode(event.currentTarget.value)} aria-label="Sort projects">
                      <option value="recent">Recent</option>
                      <option value="name">Name</option>
                    </select>
                  </label>
                  <div className="dashboard-segmented" aria-label="Project view">
                    <button className={viewMode === "grid" ? "active" : ""} type="button" aria-label="Grid view" onClick={() => setViewMode("grid")}><Grid3X3 size={17} /></button>
                    <button className={viewMode === "list" ? "active" : ""} type="button" aria-label="List view" onClick={() => setViewMode("list")}><List size={18} /></button>
                  </div>
                </div>
              </div>

              {visibleProjects.length ? (
                <div className={viewMode === "grid" ? "project-grid" : "project-list"}>
                  {visibleProjects.map((project) => (
                    <article
                      className={`project-card ${openProjectMenuId === project.id ? "menu-open" : ""}`}
                      data-project-menu-root={project.id}
                      key={project.id}
                    >
                      <button className="project-card-open" type="button" disabled={projectBusy} onClick={() => void onOpenProject(project).catch((error) => setMessage(error instanceof Error ? error.message : "Could not open the project."))}>
                        <CloudProjectPreview project={project} />
                        <span className="project-card-title">{project.name}</span>
                        <span className="project-card-meta">{formatUpdated(project.updatedAt)} · {formatBytes(project.sizeBytes)}</span>
                      </button>
                      <button
                        className="project-menu-trigger"
                        type="button"
                        aria-label={`Project options for ${project.name}`}
                        aria-expanded={openProjectMenuId === project.id}
                        onClick={() => setOpenProjectMenuId((current) => current === project.id ? null : project.id)}
                      >
                        <EllipsisVertical size={19} strokeWidth={2.5} />
                      </button>
                      {openProjectMenuId === project.id ? (
                        <div className="project-card-menu" role="menu" aria-label={`Options for ${project.name}`}>
                          <button type="button" role="menuitem" onClick={() => startProjectRename(project)}><Pencil size={16} /><span>Rename</span></button>
                          <a role="menuitem" href={`/api/cloud/projects/${project.id}/export`}><Download size={16} /><span>Export</span></a>
                          <button className="delete" type="button" role="menuitem" onClick={() => { setOpenProjectMenuId(null); setProjectPendingDeleteId(project.id); }}><Trash2 size={16} /><span>Delete</span></button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="project-empty"><strong>No projects yet</strong><span>Create a 3D design and it will appear here.</span></div>
              )}
            </>
          )}
        </section>
      </div>

      {projectPendingDelete ? (
        <section className="dashboard-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-cloud-project-title">
          <div className="dashboard-confirm-dialog">
            <header><strong id="delete-cloud-project-title">Delete project?</strong><button type="button" aria-label="Cancel project deletion" onClick={() => setProjectPendingDeleteId(null)}><X size={18} /></button></header>
            <p>Do you actually want the project <span>{projectPendingDelete.name}</span> to be deleted? Its private R2 file will be removed.</p>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={() => setProjectPendingDeleteId(null)}>Cancel</button>
              <button className="dashboard-confirm-delete" type="button" disabled={projectBusy} onClick={() => {
                void onDeleteProject(projectPendingDelete)
                  .then(() => setProjectPendingDeleteId(null))
                  .catch((error) => setMessage(error instanceof Error ? error.message : "Could not delete the project."));
              }}>Delete</button>
            </div>
          </div>
        </section>
      ) : null}

      {projectPendingRename ? (
        <section className="dashboard-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="rename-cloud-project-title">
          <form className="dashboard-confirm-dialog dashboard-rename-dialog" onSubmit={(event) => { event.preventDefault(); void confirmProjectRename(); }}>
            <header><strong id="rename-cloud-project-title">Rename project</strong><button type="button" aria-label="Cancel project rename" onClick={() => setProjectPendingRenameId(null)}><X size={18} /></button></header>
            <label><span>Project name</span><input autoFocus maxLength={120} value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.currentTarget.value)} /></label>
            <div className="dashboard-confirm-actions">
              <button className="dashboard-confirm-cancel" type="button" onClick={() => setProjectPendingRenameId(null)}>Cancel</button>
              <button className="dashboard-confirm-save" type="submit" disabled={projectBusy || !projectNameDraft.trim()}>Save</button>
            </div>
          </form>
        </section>
      ) : null}

      {settingsOpen ? (
        <section className="dashboard-settings-panel cloud-dashboard-settings" role="dialog" aria-modal="true" aria-label="SketchForge Cloud settings">
          <header><strong>Settings</strong><button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={18} /></button></header>

          <div className="cloud-settings-profile">
            {status.user.avatarUrl ? <img src={status.user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{(status.user.displayName || status.user.email).slice(0, 1).toUpperCase()}</span>}
            <div><strong>{status.user.displayName || "SketchForge account"}</strong><small>{status.user.email}</small></div>
          </div>

          {message ? <p className="cloud-settings-message" role="status">{message}</p> : null}

          <section className="cloud-settings-section">
            <header><h2>Subscription</h2><span className={`cloud-status-pill is-${status.subscription.status}`}>{statusLabel}</span></header>
            <dl>
              <div><dt>Plan</dt><dd>Cloud · $7/month</dd></div>
              <div><dt>Period end</dt><dd>{formatUnixDate(status.subscription.periodEnd)}</dd></div>
              <div><dt>Cancellation</dt><dd>{status.subscription.cancelAtPeriodEnd ? "Scheduled" : "Not scheduled"}</dd></div>
            </dl>
            <button className="cloud-settings-primary" type="button" disabled={busy} onClick={() => void openPortal()}>Manage billing in Stripe</button>
          </section>

          <section className="cloud-settings-section">
            <header><h2>Cloud storage</h2><strong>20 GB</strong></header>
            <div className="cloud-storage-meter" role="progressbar" aria-label="Cloud storage used" aria-valuemin={0} aria-valuemax={status.storage.quotaBytes} aria-valuenow={status.storage.usedBytes}>
              <span style={{ width: `${usagePercent}%`, minWidth: status.storage.usedBytes > 0 ? 3 : 0 }} />
            </div>
            <p>{formatBytes(status.storage.usedBytes)} used of 20 GB</p>
          </section>

          <section className="cloud-settings-section cloud-settings-actions">
            <h2>Account data</h2>
            <button type="button" disabled={busy} onClick={() => void exportAccount()}><Download size={16} />Export account data</button>
            <button type="button" disabled={busy} onClick={() => void logout()}><LogOut size={16} />Sign out</button>
          </section>

          <section className="cloud-settings-section cloud-settings-danger">
            <h2>Delete account</h2>
            <p>This immediately signs you out and permanently removes your SketchForge Cloud identity. Project and billing cleanup continues automatically.</p>
            {status.deletionRequestedAt ? <strong>Requested {formatUnixDate(status.deletionRequestedAt)}</strong> : <button type="button" onClick={() => setDeleteOpen(true)}>Start deletion request</button>}
          </section>
        </section>
      ) : null}

      {deleteOpen ? (
        <section className="cloud-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="cloud-dashboard-delete-account-title">
          <div>
            <h2 id="cloud-dashboard-delete-account-title">Permanently delete account?</h2>
            <p>You will be signed out immediately and redirected to Google sign-in. Enter your account email and type <strong>DELETE</strong>. Recent Google authentication is required.</p>
            <label>Account email<input value={deleteEmail} onChange={(event) => setDeleteEmail(event.currentTarget.value)} /></label>
            <label>Confirmation<input value={deleteWord} onChange={(event) => setDeleteWord(event.currentTarget.value)} placeholder="DELETE" /></label>
            <div><button type="button" onClick={() => setDeleteOpen(false)}>Cancel</button><button type="button" disabled={busy} onClick={() => void requestDeletion()}>Permanently delete</button></div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
