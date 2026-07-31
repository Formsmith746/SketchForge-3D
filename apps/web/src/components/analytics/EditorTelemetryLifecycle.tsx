"use client";

import { useEffect } from "react";
import {
  ANALYTICS_CONSENT_EVENT,
  EDITOR_HEALTH_FAILURE_EVENT,
  markTelemetrySessionFlag,
  reportEditorHealthFailure,
  trackReturningCreator,
  trackTelemetryOncePerSession,
} from "@/lib/telemetry";

const EDITOR_LOAD_TIMEOUT_MS = 20_000;

export default function EditorTelemetryLifecycle() {
  useEffect(() => {
    let editorLoaded = false;
    let sessionHealthy = true;
    let observedCanvas: HTMLCanvasElement | null = null;

    const handleWebglContextLost = () => {
      sessionHealthy = false;
      reportEditorHealthFailure("fatal-editor-error");
    };
    const recordLoadedEditor = () => {
      const canvas = document.querySelector<HTMLCanvasElement>(".three-workplane-host canvas");
      if (!canvas) return false;
      if (!editorLoaded) {
        editorLoaded = true;
        markTelemetrySessionFlag("editor-intent");
        trackTelemetryOncePerSession("editor-opened");
        trackReturningCreator();
      }
      if (observedCanvas !== canvas) {
        observedCanvas?.removeEventListener("webglcontextlost", handleWebglContextLost);
        observedCanvas = canvas;
        observedCanvas.addEventListener("webglcontextlost", handleWebglContextLost);
      }
      return true;
    };
    const handleFatalError = () => {
      sessionHealthy = false;
      reportEditorHealthFailure("fatal-editor-error");
    };
    const handleHealthFailure = () => {
      sessionHealthy = false;
    };
    const handleConsent = () => {
      if (editorLoaded) {
        trackTelemetryOncePerSession("editor-opened");
        trackReturningCreator();
      }
    };
    const handlePageHide = () => {
      if (editorLoaded && sessionHealthy) {
        trackTelemetryOncePerSession("crash-free-session");
      }
    };

    const observer = new MutationObserver(() => {
      if (recordLoadedEditor()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    recordLoadedEditor();

    const loadingTimer = window.setTimeout(() => {
      if (editorLoaded) return;
      sessionHealthy = false;
      reportEditorHealthFailure("frozen-editor-loading");
    }, EDITOR_LOAD_TIMEOUT_MS);

    window.addEventListener("error", handleFatalError);
    window.addEventListener("unhandledrejection", handleFatalError);
    window.addEventListener(EDITOR_HEALTH_FAILURE_EVENT, handleHealthFailure);
    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      observer.disconnect();
      window.clearTimeout(loadingTimer);
      observedCanvas?.removeEventListener("webglcontextlost", handleWebglContextLost);
      window.removeEventListener("error", handleFatalError);
      window.removeEventListener("unhandledrejection", handleFatalError);
      window.removeEventListener(EDITOR_HEALTH_FAILURE_EVENT, handleHealthFailure);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  return null;
}
