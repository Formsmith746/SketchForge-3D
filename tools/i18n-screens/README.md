# i18n-screens

Screenshots every SketchForge screen in every UI language and reports where a translation breaks
the layout compared with the baseline language (English by default). Lives outside the app: it drives
the running app in a browser and reads the catalogs in `apps/web/src/i18n/locales`, without changing
app code.

## Run

```bash
cd tools/i18n-screens
npm install            # playwright-core only; uses the installed Google Chrome
npm run report         # starts `next dev` on port 3199, shoots every language the app offers
```

The report opens from `out/<timestamp>/index.html` (ignored by git).

| Option | Default | |
|---|---|---|
| `--languages en,ru,de` | languages in the app's language menu | the baseline is always included |
| `--baseline en` | `en` | language the others are compared with |
| `--viewports 1440x900,1100x700` | `1440x900` | each viewport is a separate tab in the report |
| `--screens settings-,tutorial-key-tag` | all | screen id prefixes; chapters without them are skipped |
| `--base-url http://127.0.0.1:3000` | starts a dev server | use an app that is already running |
| `--port 3199` | `3199` | port for the dev server it starts |
| `--out DIR` | `out/<timestamp>` | |
| `--color-scheme dark` | `light` | |
| `--browser chromium\|msedge` | `chrome` | installed browser channel; `chromium` needs `npx playwright install chromium` |
| `--executable-path PATH` | | browser binary instead of a channel |
| `--headed` | | show the browser while it works |

A full run for two languages takes a few minutes; most of it is the editor loading for each chapter.

## Network

The tool sends nothing anywhere: it talks only to the app at `--base-url` (by default the dev server it starts on
127.0.0.1) and writes the report to `--out`.

- Chrome runs with a fresh temporary profile and may resolve only the app's host, so its own background requests
  (component updates, push messaging) cannot leave the machine.
- The dev server runs with Next.js telemetry off. As with any `npm run dev`, Next.js asks registry.npmjs.org for its
  latest version, and the dashboard's update check reads `package.json` from raw.githubusercontent.com.

## What it reports

For every visible piece of text the page records its box, line count and whether it fits. Elements are
matched across languages by their position in the DOM, not by their text.

| Category | Meaning |
|---|---|
| Clipped | text is cut off by its box, or a select/placeholder is wider than its field |
| Sticks out | text extends past the button or cell that holds it |
| Extra wrap | a label, button, heading or menu item wraps onto more lines than in the baseline |
| Same as baseline | text identical to the baseline language: possibly untranslated. Names, formats and numbers that stay the same on purpose are listed in `src/config.mjs` |
| Also in baseline | the baseline has the same problem: a layout issue rather than a translation issue |

## Report

- Screens side by side for all languages, with frames over the problem elements. Toggle frames per
  category, hide languages, show only screens with issues, filter by text, switch viewport.
- The table at the top counts issues per screen and language; click a cell to jump to the screen.
- Click a frame (or tick an issue) to mark it, add a note in the bottom drawer, then **Copy for agent**:
  a Markdown task with every marked issue, its text in both languages, the catalog key and file that
  render it, element size, screenshot paths, the translation rules to follow and the command that
  re-checks those screens. Marks are kept in the browser for that report.
- Click a screenshot to see it at full size with the frames.

## Add a screen

Screens are captured by chapters in `src/tour.mjs`. Each chapter starts on a fresh dashboard; call
`ui.capture(id, title, { scope })` after the steps that open a screen. Find controls by class, icon or
role, or by their label from the catalog with `ui.label("editor.toolbar.align")`, never by literal
text, so the same steps work in every language. Start the id with one of the chapter's `screens`
prefixes.

## Files

| File | |
|---|---|
| `src/run.mjs` | command line, dev server, browser, runs the tour per viewport and language |
| `src/tour.mjs` | the screens and how to reach them |
| `src/detect.mjs` | runs in the page: text boxes, lines, overflow |
| `src/compare.mjs` | issues of one language against the baseline |
| `src/catalogs.mjs` | reads the catalogs; labels for steps, keys for issues |
| `src/config.mjs` | categories and text allowed to stay the same |
| `src/report.mjs`, `src/report-template.html` | the HTML report |
