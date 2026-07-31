"use client";

import { useEffect, useState } from "react";
import { cloudFetch, formatBytes, formatUnixDate, getCloudStatus, type CloudProjectSummary, type CloudStatus } from "@/lib/cloudApi";

type ProjectListResponse = { projects: CloudProjectSummary[]; readOnly: boolean };

export default function AccountDashboard() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteWord, setDeleteWord] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const account = await getCloudStatus();
        setStatus(account);
        if (account.entitlement.canReadProjects || account.entitlement.canWriteProjects) {
          const list = await cloudFetch<ProjectListResponse>("/api/cloud/projects");
          setProjects(list.projects);
        }
      } catch {
        window.location.replace("/cloud/subscribe");
      }
    })();
  }, []);

  const openPortal = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await cloudFetch<{ url: string }>("/api/cloud/billing/portal", { method: "POST", body: JSON.stringify({}) });
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the billing portal.");
    } finally {
      setBusy(false);
    }
  };

  const exportAccount = async () => {
    setBusy(true);
    try {
      const data = await cloudFetch<Record<string, unknown>>("/api/cloud/account/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sketchforge-cloud-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
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
      await cloudFetch<{ status: string; executeAfter: number | null }>("/api/cloud/account/delete-request", {
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
    await cloudFetch<{ ok: true }>("/api/cloud/auth/logout", { method: "POST", body: JSON.stringify({}) });
    window.location.replace("/");
  };

  if (!status) return <main className="cloud-state-page"><div className="cloud-state-card"><div className="cloud-spinner" /><h1>Loading account</h1></div></main>;

  const usagePercent = Math.min(100, status.storage.quotaBytes ? (status.storage.usedBytes / status.storage.quotaBytes) * 100 : 0);
  const statusLabel = status.subscription.status.replaceAll("_", " ");
  const projectsFrozen = status.entitlement.projectAccess === "frozen";
  const projectsLocked = status.entitlement.projectAccess === "locked" && status.projectCount > 0;
  const legacyDeletionRequest = status.deletionRequest && ["requested", "cancel_scheduled"].includes(status.deletionRequest.status);

  return (
    <div className="cloud-account-page">
      <header className="minimal-landing-blue cloud-login-header">
        <nav className="minimal-nav" aria-label="Cloud account navigation">
          <a className="minimal-nav-brand" href="/"><img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" /><span>SketchForge</span></a>
          <span className="cloud-login-nav-spacer" />
          <div className="minimal-nav-actions cloud-login-nav-actions"><a href="/demo">Free demo</a><a className="minimal-nav-cloud" href="/cloud">Open Cloud</a></div>
        </nav>
      </header>

      <main className="cloud-account-main">
        <header className="cloud-account-title"><div><p className="cloud-product-kicker">Account &amp; billing</p><h1>{status.user.displayName || "SketchForge account"}</h1><p>{status.user.email}</p></div><button type="button" onClick={() => void logout()}>Sign out</button></header>

        {projectsFrozen ? <aside className="cloud-recovery-banner"><strong>Your projects are frozen</strong><span>Editing and saving are disabled. You can view and export projects until {formatUnixDate(status.entitlement.graceEndsAt)}. Renew before then to restore full access.</span><button type="button" onClick={() => void openPortal()}>{status.entitlement.needsPaymentRecovery ? "Repair payment" : "Renew subscription"}</button></aside> : null}
        {!projectsFrozen && status.entitlement.needsPaymentRecovery ? <aside className="cloud-recovery-banner"><strong>Payment action is required</strong><span>The seven-day recovery window has ended, so project content is inaccessible until the subscription is restored.</span><button type="button" onClick={() => void openPortal()}>Repair payment</button></aside> : null}
        {projectsLocked && !status.entitlement.needsPaymentRecovery ? <aside className="cloud-recovery-banner"><strong>Project access has ended</strong><span>Your projects remain stored, but they are inaccessible until you renew SketchForge Cloud.</span><a href="/cloud/subscribe">Renew subscription</a></aside> : null}
        {message ? <p className="cloud-flow-message" role="status">{message}</p> : null}

        <section className="cloud-account-grid">
          <article className="cloud-account-card">
            <header><h2>Subscription</h2><span className={`cloud-status-pill is-${status.subscription.status}`}>{statusLabel}</span></header>
            <dl><div><dt>Plan</dt><dd>SketchForge Cloud · $7/month</dd></div><div><dt>Period end</dt><dd>{formatUnixDate(status.subscription.periodEnd)}</dd></div><div><dt>Cancellation</dt><dd>{status.subscription.cancelAtPeriodEnd ? "Scheduled for period end" : "Not scheduled"}</dd></div></dl>
            <button className="cloud-primary-action" type="button" disabled={busy} onClick={() => void openPortal()}>Open Stripe billing portal</button>
            <p>Update payment details, view invoices, repair payments, or cancel at period end in Stripe’s hosted portal.</p>
          </article>

          <article className="cloud-account-card">
            <header><h2>Storage</h2><strong>20 GB</strong></header>
            <div className="cloud-storage-meter" role="progressbar" aria-label="Cloud storage used" aria-valuemin={0} aria-valuemax={status.storage.quotaBytes} aria-valuenow={status.storage.usedBytes}>
              <span style={{ width: `${usagePercent}%`, minWidth: status.storage.usedBytes > 0 ? 3 : 0 }} />
            </div>
            <p>{formatBytes(status.storage.usedBytes)} used of 20 GB</p>
            <dl><div><dt>Projects</dt><dd>{status.projectCount}</dd></div><div><dt>Access</dt><dd>{status.entitlement.projectAccess === "active" ? "Read & write" : status.entitlement.projectAccess === "frozen" ? "Frozen · read-only & export" : "Locked until renewal"}</dd></div></dl>
          </article>
        </section>

        <section className="cloud-projects-panel">
          <header><div><h2>Your projects</h2><p>Every download is authenticated and ownership-checked by the server.</p></div>{status.entitlement.canWriteProjects ? <a href="/cloud">Open editor</a> : null}</header>
          {projects.length ? <div className="cloud-account-project-list">{projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><span>{formatBytes(project.sizeBytes)} · Updated {formatUnixDate(project.updatedAt)}</span></div><a href={`/api/cloud/projects/${project.id}/export`}>Download</a></article>)}</div> : <p>No accessible cloud projects.</p>}
        </section>

        <section className="cloud-account-grid">
          <article className="cloud-account-card"><h2>Export account data</h2><p>Download account information and project metadata. The export includes authenticated download links for each project file.</p><button type="button" disabled={busy} onClick={() => void exportAccount()}>Export account JSON</button></article>
          <article className="cloud-account-card cloud-danger-card">
            <h2>Permanently delete account</h2>
            <p>This immediately signs you out and removes your SketchForge Cloud identity. Your projects, previews, and Stripe test customer are then permanently cleaned up automatically.</p>
            {status.deletionRequest ? <p><strong>Status: {status.deletionRequest.status.replaceAll("_", " ")}</strong>{status.deletionRequest.executeAfter ? <> · Scheduled {formatUnixDate(status.deletionRequest.executeAfter)}</> : null}</p> : null}
            {!status.deletionRequest || legacyDeletionRequest ? <button type="button" onClick={() => setDeleteOpen(true)}>{legacyDeletionRequest ? "Confirm existing request" : "Delete my account"}</button> : null}
          </article>
        </section>

        {deleteOpen ? <section className="cloud-delete-confirm" role="dialog" aria-modal="true"><div><h2>Permanently delete account?</h2><p>You will be signed out immediately and redirected to Google sign-in. Your cloud projects and account data cannot be recovered. Enter your account email and type <strong>DELETE</strong>. You must have signed in with Google during the last 10 minutes.</p><label>Account email<input value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} /></label><label>Confirmation<input value={deleteWord} onChange={(event) => setDeleteWord(event.target.value)} placeholder="DELETE" /></label><div><button type="button" onClick={() => setDeleteOpen(false)}>Keep account</button><button type="button" disabled={busy} onClick={() => void requestDeletion()}>Permanently delete</button></div></div></section> : null}
      </main>
    </div>
  );
}
