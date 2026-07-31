"use client";

import { useEffect, useState } from "react";
import { getCloudStatus } from "@/lib/cloudApi";

const MAX_POLLS = 36;

export default function ActivatingFlow() {
  const [message, setMessage] = useState("Waiting for Stripe’s verified webhook confirmation…");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const status = await getCloudStatus();
        if (cancelled) return;
        if (status.entitlement.canOpenEditor) {
          setMessage("Subscription confirmed. Opening SketchForge Cloud…");
          window.location.replace("/cloud");
          return;
        }
        if (["past_due", "unpaid", "paused", "incomplete_expired", "canceled"].includes(status.subscription.status)) {
          window.location.replace("/cloud/account");
          return;
        }
        setMessage(status.subscription.status === "incomplete"
          ? "Payment is still incomplete. Waiting for Stripe…"
          : "Payment returned, but the webhook has not confirmed an active subscription yet.");
      } catch {
        if (!cancelled && attempts === 1) setMessage("Sign in again to check the subscription.");
      }
      if (cancelled) return;
      if (attempts >= MAX_POLLS) {
        setTimedOut(true);
        setMessage("Confirmation is taking longer than expected. Access remains locked until the webhook is verified.");
        return;
      }
      timer = window.setTimeout(() => void poll(), 2500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="cloud-state-page">
      <section className="cloud-state-card">
        <div className={timedOut ? "cloud-state-icon" : "cloud-spinner"}>{timedOut ? "!" : null}</div>
        <p className="cloud-product-kicker">Secure activation</p>
        <h1>Confirming your subscription</h1>
        <p>{message}</p>
        <div className="cloud-activation-rule"><strong>Access is server controlled</strong><span>This page does not trust Checkout URL parameters or browser storage.</span></div>
        <div className="cloud-state-actions"><a href="/cloud/account">View account status</a><a href="/cloud/subscribe">Return to plan</a></div>
      </section>
    </main>
  );
}
