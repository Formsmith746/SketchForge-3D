"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { cloudFetch } from "@/lib/cloudApi";

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: "auto";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function GoogleAuthButton() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [config, setConfig] = useState<{ siteKey: string; action: string } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking your browser…");

  useEffect(() => {
    let cancelled = false;
    void cloudFetch<{ siteKey: string; action: string }>("/api/cloud/turnstile/config")
      .then((value) => {
        if (!cancelled) setConfig(value);
      })
      .catch(() => {
        if (!cancelled) setMessage("Human verification could not load. Refresh and try again.");
      });
    return () => { cancelled = true; };
  }, []);

  const renderTurnstile = useCallback(() => {
    if (!scriptReady || !config || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: config.siteKey,
      action: config.action,
      theme: "auto",
      callback: (nextToken) => {
        setToken(nextToken);
        setMessage("Verified. You can continue with Google.");
      },
      "expired-callback": () => {
        setToken("");
        setMessage("Verification expired. Please complete it again.");
      },
      "error-callback": () => {
        setToken("");
        setMessage("Human verification failed to load. Refresh and try again.");
      },
    });
  }, [config, scriptReady]);

  useEffect(() => {
    renderTurnstile();
  }, [renderTurnstile]);

  const startGoogleAuth = async () => {
    if (!token || busy) return;
    setBusy(true);
    setMessage("Starting Google sign-in…");
    try {
      const result = await cloudFetch<{ url: string }>("/api/cloud/auth/google", {
        method: "POST",
        body: JSON.stringify({ returnTo: "/cloud", turnstileToken: token }),
      });
      const destination = new URL(result.url);
      if (destination.origin !== "https://accounts.google.com") throw new Error("Unexpected sign-in destination");
      window.location.assign(destination.toString());
    } catch (error) {
      setBusy(false);
      setToken("");
      setMessage(error instanceof Error ? error.message : "Could not start Google sign-in. Try again.");
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    }
  };

  return (
    <div className="cloud-auth-google-wrap">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => setMessage("Human verification could not load. Refresh and try again.")}
      />
      <div
        ref={containerRef}
        className="cf-turnstile cloud-turnstile"
        data-sitekey={config?.siteKey}
        data-action="turnstile-spin-v2"
        aria-label="Human verification"
      />
      <p className="cloud-turnstile-status" role="status">{message}</p>
      <button className="cloud-auth-google" type="button" disabled={!token || busy} onClick={() => void startGoogleAuth()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
          <path fill="#34a853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.83-1.77-5.62-4.15H3.03v2.62A10 10 0 0 0 12 22Z" />
          <path fill="#fbbc05" d="M6.38 13.91A6.02 6.02 0 0 1 6.07 12c0-.66.11-1.31.31-1.91V7.47H3.03A10 10 0 0 0 2 12c0 1.61.39 3.14 1.03 4.53l3.35-2.62Z" />
          <path fill="#ea4335" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.97 5.47l3.35 2.62C7.17 7.71 9.39 5.94 12 5.94Z" />
        </svg>
        <span>{busy ? "Opening Google…" : "Continue with Google"}</span>
        <span className="cloud-auth-google-arrow" aria-hidden="true">→</span>
      </button>
    </div>
  );
}
