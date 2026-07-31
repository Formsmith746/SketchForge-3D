"use client";

import { useEffect, useState } from "react";
import GoogleAuthButton from "@/components/cloud/GoogleAuthButton";
import { CloudApiError, cloudFetch, getCloudStatus, type CloudStatus } from "@/lib/cloudApi";

export default function SubscribeFlow() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmPrivacy, setConfirmPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCloudStatus()
      .then((next) => {
        setStatus(next);
        if (next.entitlement.canOpenEditor) window.location.replace("/cloud");
      })
      .catch((error) => {
        if (!(error instanceof CloudApiError) || error.status !== 401) setMessage("Account status is temporarily unavailable.");
      })
      .finally(() => setLoading(false));
  }, []);

  const subscribe = async () => {
    if (!status) return;
    setBusy(true);
    setMessage("");
    try {
      if (!status.legal.accepted) {
        if (!acceptTerms || !confirmPrivacy) {
          setMessage("Accept the Terms and confirm the Privacy Policy first.");
          return;
        }
        await cloudFetch<{ ok: true }>("/api/cloud/legal/accept", {
          method: "POST",
          body: JSON.stringify({ acceptTerms, confirmPrivacy }),
        });
      }
      const checkout = await cloudFetch<{ url: string }>("/api/cloud/billing/checkout", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.location.assign(checkout.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start test Checkout.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cloud-product-page">
      <header className="minimal-landing-blue cloud-login-header">
        <nav className="minimal-nav" aria-label="Cloud subscription navigation">
          <a className="minimal-nav-brand" href="/"><img src="/assets/sketchforge/sketchforge-logo-white.png" alt="" /><span>SketchForge</span></a>
          <span className="cloud-login-nav-spacer" aria-hidden="true" />
          <div className="minimal-nav-actions cloud-login-nav-actions"><a href="/demo">Free demo</a><a className="minimal-nav-cloud" href="/cloud/account">Account</a></div>
        </nav>
      </header>

      <main className="cloud-product-main">
        <section className="cloud-product-copy">
          <p className="cloud-product-kicker">SketchForge Cloud</p>
          <h1>Your 3D workspace, synced across devices.</h1>
          <p>Use the full SketchForge editor with private cloud project storage and a simple monthly plan.</p>
          <ul>
            <li><strong>20 GB</strong><span>Private cloud project storage</span></li>
            <li><strong>Any device</strong><span>Continue in a modern browser</span></li>
            <li><strong>7-day grace</strong><span>View and export frozen projects before access locks</span></li>
          </ul>
        </section>

        <section className="cloud-subscribe-card" aria-labelledby="cloud-plan-heading">
          <p className="cloud-subscribe-test-badge">Staging · Stripe test mode</p>
          <h2 id="cloud-plan-heading">SketchForge Cloud</h2>
          <p className="cloud-subscribe-price"><strong>$7</strong><span>USD / month</span></p>
          <p>Recurring monthly billing. No free trial. Cancellation takes effect after the paid period, followed by seven days of frozen read-only project access.</p>
          <div className="cloud-plan-details"><span>20 GB included</span><span>Monthly subscription</span><span>Test payment only</span></div>

          {loading ? <p className="cloud-flow-message">Checking your account…</p> : status ? (
            <>
              <p className="cloud-signed-in">Signed in as <strong>{status.user.email}</strong></p>
              {!status.legal.accepted ? (
                <div className="cloud-legal-acceptance">
                  <label><input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} /><span>I accept the <a href={status.legal.termsUrl} target="_blank">Terms of Service</a> version {status.legal.termsVersion}.</span></label>
                  <label><input type="checkbox" checked={confirmPrivacy} onChange={(event) => setConfirmPrivacy(event.target.checked)} /><span>I confirm that I have read the <a href={status.legal.privacyUrl} target="_blank">Privacy Policy</a> version {status.legal.privacyVersion}.</span></label>
                </div>
              ) : <p className="cloud-legal-complete">Current Terms and Privacy Policy accepted.</p>}
              <button className="cloud-checkout-button" type="button" disabled={busy} onClick={() => void subscribe()}>{busy ? "Opening secure test Checkout…" : status.subscription.status === "canceled" || status.subscription.status === "incomplete_expired" ? "Renew for $7/month" : "Subscribe for $7/month"}</button>
            </>
          ) : <GoogleAuthButton />}

          {message ? <p className="cloud-flow-error" role="alert">{message}</p> : null}
          <p className="cloud-subscribe-fineprint">Payments are handled by Stripe Checkout. The staging site accepts test cards only. A Checkout redirect never grants access; only a verified webhook can update your entitlement.</p>
          <nav className="cloud-policy-links"><a href="/refund-cancellation">Cancellation</a><a href="/data-retention">Data retention</a><a href="/privacy">Privacy</a></nav>
        </section>
      </main>
    </div>
  );
}
