# SketchForge product dashboard

Dashboard name: `SketchForge Product Health`

Use the Cloudflare HTTP traffic dataset. Apply a dashboard-wide filter for hostname `sketchforge3d.com`; include `www.sketchforge3d.com` only if traffic is intentionally served there.

The event paths below are real static assets. They do not invoke a Worker. Each browser emits them only after optional analytics consent, suppresses automated/headless clients, and deduplicates the event for the stated period or browser session.

## Visitor overview

| Card | Visualization | Metric and filter | Time range |
| --- | --- | --- | --- |
| Human visitors today | Stat | Total requests where path equals `/telemetry/human-visitor-today.svg` | Today |
| Human visitors, 7 days | Stat | Total requests where path equals `/telemetry/human-visitor-7d.svg` | Last 7 days |
| Human visitors, 30 days | Stat | Total requests where path equals `/telemetry/human-visitor-30d.svg` | Last 30 days |
| Real visitors by country | Map and Top N | Total requests where path equals `/telemetry/human-visitor-30d.svg`, grouped by client country | Last 30 days |

## Activation

| Card | Visualization | Metric and filter |
| --- | --- | --- |
| Editor opens | Stat and timeseries | Total requests where path equals `/telemetry/editor-opened.svg` |
| Successful creators | Stat and timeseries | Total requests where path equals `/telemetry/successful-creator.svg` |
| Bounce rate | Percentage | Requests to `/telemetry/landing-bounce.svg` divided by requests to `/telemetry/human-visitor-today.svg` |

An editor open is counted only after the Three.js workplane canvas exists. A successful creator is counted once per browser session when the scene first contains a created or imported shape. A bounce is a landing session that leaves without choosing or loading the editor.

## Retention

| Card | Visualization | Formula |
| --- | --- | --- |
| Returning creators, 7 days | Percentage | Requests to `/telemetry/returning-creator-7d.svg` divided by requests to `/telemetry/successful-creator.svg` |
| Returning creators, 30 days | Percentage | Requests to `/telemetry/returning-creator-30d.svg` divided by requests to `/telemetry/successful-creator.svg` |

A return is recorded when a browser that previously produced a successful creator event opens the editor again after at least 30 minutes and within the stated window. No visitor identifier is sent to the server.

## Tutorial funnel

Create three adjacent Stat cards and one percentage card:

- Started: `/telemetry/tutorial-started.svg`
- Completed: `/telemetry/tutorial-completed.svg`
- Skipped: `/telemetry/tutorial-skipped.svg`
- Completion rate: completed divided by started

## Reliability

| Card | Visualization | Formula or filter |
| --- | --- | --- |
| Crash-free sessions | Percentage | `/telemetry/crash-free-session.svg` divided by the sum of `/telemetry/crash-free-session.svg` and `/telemetry/failed-editor-session.svg` |
| Failure reasons | Bar | Total requests for `/telemetry/fatal-editor-error.svg`, `/telemetry/frozen-editor-loading.svg`, and `/telemetry/wasm-initialization-failed.svg`, grouped by path |

A failed editor session is deduplicated even if more than one underlying failure signal occurs. Fatal JavaScript errors, unhandled promise failures, WebGL context loss, a workplane that has not initialized within 20 seconds, and failed Manifold WASM initialization all mark the session as failed.

## Natural-language chart prompts

If the Cloudflare Custom Dashboard editor offers prompt-based chart creation, use these prompts one at a time:

1. `Show total requests to /telemetry/human-visitor-today.svg on sketchforge3d.com today as a stat named Human visitors today.`
2. `Show total requests to /telemetry/human-visitor-7d.svg on sketchforge3d.com over the last 7 days as a stat named Human visitors - 7 days.`
3. `Show total requests to /telemetry/human-visitor-30d.svg on sketchforge3d.com over the last 30 days as a stat named Human visitors - 30 days.`
4. `Show requests to /telemetry/editor-opened.svg on sketchforge3d.com as a stat and timeseries named Editor opens.`
5. `Show requests to /telemetry/successful-creator.svg on sketchforge3d.com as a stat and timeseries named Successful creators.`
6. `Show the percentage of requests to /telemetry/landing-bounce.svg divided by requests to /telemetry/human-visitor-today.svg, named Bounce rate.`
7. `Show the percentage of requests to /telemetry/returning-creator-7d.svg divided by requests to /telemetry/successful-creator.svg, named Returning creators - 7 days.`
8. `Show the percentage of requests to /telemetry/returning-creator-30d.svg divided by requests to /telemetry/successful-creator.svg, named Returning creators - 30 days.`
9. `Show requests to the tutorial-started, tutorial-completed, and tutorial-skipped SVG paths under /telemetry/ as three stat cards.`
10. `Show the percentage of crash-free-session requests divided by crash-free-session plus failed-editor-session requests under /telemetry/, named Crash-free sessions.`
11. `Show requests to /telemetry/human-visitor-30d.svg grouped by client country as a map and top-N table named Real visitors by country.`
