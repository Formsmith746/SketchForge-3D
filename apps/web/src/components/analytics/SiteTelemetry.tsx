"use client";

import { useEffect } from "react";
import {
  ANALYTICS_CONSENT_EVENT,
  analyticsConsentGranted,
  hasTelemetrySessionFlag,
  markTelemetrySessionFlag,
  trackHumanVisitorWindows,
  trackTelemetryOncePerSession,
} from "@/lib/telemetry";

export default function SiteTelemetry() {
  useEffect(() => {
    const recordVisitor = () => {
      if (!analyticsConsentGranted()) return;
      trackHumanVisitorWindows();
    };
    const handleConsent = (event: Event) => {
      if ((event as CustomEvent<{ granted?: boolean }>).detail?.granted) recordVisitor();
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin === window.location.origin && (destination.pathname === "/demo" || destination.pathname === "/normal")) {
        markTelemetrySessionFlag("editor-intent");
      }
    };
    const handlePageHide = () => {
      if (window.location.pathname !== "/" || hasTelemetrySessionFlag("editor-intent")) return;
      trackTelemetryOncePerSession("landing-bounce");
    };

    recordVisitor();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  return null;
}
