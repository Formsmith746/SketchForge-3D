"use client";

import { useEffect, useState } from "react";
import { ANALYTICS_CONSENT_KEY, announceAnalyticsConsent } from "@/lib/telemetry";

type ConsentChoice = "all" | "necessary";

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === null);
  }, []);

  const saveChoice = (choice: ConsentChoice) => {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
    announceAnalyticsConsent(choice === "all");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <aside className="cookie-banner" aria-label="Cookie preferences" aria-live="polite">
      <div className="cookie-banner-copy">
        <h2>Cookie preferences</h2>
        <p>
          SketchForge uses essential cookies for core functionality and optional analytics cookies to improve the product.
          {" "}<a href="/privacy">Privacy policy</a>
        </p>
      </div>

      <div className="cookie-banner-actions">
        <button className="cookie-banner-necessary" type="button" onClick={() => saveChoice("necessary")}>
          Reject optional
        </button>
        <button className="cookie-banner-accept" type="button" onClick={() => saveChoice("all")}>
          Accept all
        </button>
      </div>
    </aside>
  );
}
