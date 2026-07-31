"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import CloudOpeningScreen from "@/components/cloud/CloudOpeningScreen";
import GoogleAuthButton from "@/components/cloud/GoogleAuthButton";
import { CloudApiError, getCloudStatus, type CloudStatus } from "@/lib/cloudApi";

const CloudEditorShell = dynamic(() => import("@/components/cloud/CloudEditorShell"), {
  ssr: false,
  loading: () => <CloudOpeningScreen detail="Loading your projects" />,
});

export default function CloudEntry() {
  const [activeStatus, setActiveStatus] = useState<CloudStatus | null>(null);
  const [phase, setPhase] = useState<"checking" | "signed-out" | "error">("checking");

  useEffect(() => {
    let cancelled = false;
    void getCloudStatus()
      .then((status) => {
        if (cancelled) return;
        if (status.entitlement.canOpenEditor) {
          setActiveStatus(status);
          return;
        }
        window.location.replace(status.legal.accepted ? status.entitlement.route : "/cloud/subscribe");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof CloudApiError && error.status === 401) setPhase("signed-out");
        else {
          console.error("Cloud account status could not be loaded.");
          setPhase("error");
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (activeStatus) return <CloudEditorShell initialStatus={activeStatus} />;

  if (phase === "checking") return <CloudOpeningScreen />;

  if (phase === "error") {
    return (
      <main className="cloud-state-page">
        <div className="cloud-state-card">
          <span className="cloud-state-icon" aria-hidden="true">!</span>
          <h1>Cloud is temporarily unavailable</h1>
          <p>Your session was not changed. Try the connection again.</p>
          <div className="cloud-state-actions"><button type="button" onClick={() => window.location.reload()}>Try again</button><a href="/">Back home</a></div>
        </div>
      </main>
    );
  }

  return (
    <div className="cloud-login-page">
      <header className="minimal-landing-blue cloud-login-header">
        <nav className="minimal-nav" aria-label="Cloud account navigation">
          <a className="minimal-nav-brand" href="/" aria-label="SketchForge home">
            <img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" />
            <span>SketchForge</span>
          </a>
          <span className="cloud-login-nav-spacer" aria-hidden="true" />
          <div className="minimal-nav-actions cloud-login-nav-actions">
            <a className="minimal-nav-cloud" href="/">Back to home</a>
          </div>
        </nav>
      </header>

      <main className="cloud-login-stage">
        <section className="cloud-auth-card cloud-login-card" aria-labelledby="cloud-auth-heading">
          <div className="cloud-login-card-scroll">
            <h1 id="cloud-auth-heading">Continue to SketchForge Cloud</h1>
            <p className="cloud-auth-card-intro">
              Sign in with Google to keep your projects synced across every device.
            </p>

            <div className="cloud-login-plan" aria-label="SketchForge Cloud costs seven dollars per month">
              <div>
                <strong>SketchForge Cloud</strong>
                <span>20 GB storage · Device sync · Priority updates</span>
              </div>
              <p><strong>$7</strong><span>/ month</span></p>
            </div>

            <GoogleAuthButton />

            <p className="cloud-auth-legal">
              By continuing, you agree to the <a href="/terms">Terms</a> and acknowledge the <a href="/privacy">Privacy Policy</a>.
            </p>

            <div className="cloud-auth-divider"><span>or</span></div>

            <a className="cloud-auth-demo" href="/demo">
              <span className="cloud-auth-demo-play" aria-hidden="true">▶</span>
              <span><strong>Try the live demo instead</strong><small>Free · No account required</small></span>
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="cloud-login-footer">
        <span>© 2026 SketchForge</span>
        <nav aria-label="Cloud sign-in footer navigation">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="https://github.com/Formsmith746/SketchForge-3D" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </footer>
    </div>
  );
}
