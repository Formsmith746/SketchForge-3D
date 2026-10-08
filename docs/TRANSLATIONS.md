# Translations

The interface text lives in per-language JSON catalogs in the [use-intl](https://next-intl.dev/docs/environments/core-library)
format (the core of next-intl, without its server parts, so the static export keeps working). English is the source
language; the other languages are registered in `apps/web/src/i18n/locales.ts`, each with a language guide in
`docs/translations/`.

The language follows the system (browser or OS) by default and can be changed in **Settings → Language** on the
dashboard or in the editor's Appearance settings. The choice is stored per browser in `localStorage`
(`sketchForge.language`) and applies to the desktop tray menu and update dialogs too.

## Add a language

1. Copy `apps/web/src/i18n/locales/en/` to `apps/web/src/i18n/locales/<code>/` (`<code>` is a two- or three-letter
   ISO 639 code, for example `de`).
2. Write the language guide `docs/translations/glossary.<code>.md`: the glossary (start from the English column of an
   existing guide), the typography and the form of address. Then translate every value in `messages.json` (the web
   app) and `desktop.json` (the desktop tray menu and update dialogs) following the guide and the requirements below.
   Keep keys, `{placeholders}` and `<tags>` unchanged.
3. Register it in `apps/web/src/i18n/locales.ts`:

   ```ts
   { code: "de", nativeName: "Deutsch", complete: false, load: () => import("./locales/de") },
   ```

   Every language except English is a separate file the browser downloads only when that language is chosen, so a
   new language does not make the app larger for everyone else. English stays built in as the fallback.

   While `complete: false`, strings that are not translated yet show in English and `npm test` counts them as one
   todo instead of failing. Set `complete: true` when the language is done: from then on an untranslated string fails.
4. Run `npm test`. `tests/unit/i18n.test.ts` reports untranslated strings: missing, or still identical to English (a
   todo while the language is in progress; list them with
   `npx vitest run --config tests/vitest.config.ts tests/unit/i18n.test.ts --reporter=verbose`). A word your language
   spells like English (German „Format“) goes into `SAME_AS_ENGLISH` in that test; placeholders, unit symbols and
   format names count as translated. It also fails on keys English does not have, changed placeholders and missing
   plural forms.
5. Check the layout: `cd tools/i18n-screens && npm install && npm run report -- --languages en,<code>` screenshots
   every screen in both languages and marks clipped text, extra line wraps and untranslated strings
   ([tools/i18n-screens/README.md](../tools/i18n-screens/README.md)).

The desktop app picks up `<code>/desktop.json` automatically; `apps/desktop/electron-builder.yml` already packages every
language's `desktop.json`.

## Translation requirements

**Audience.** SketchForge is a beginner-friendly 3D editor for classrooms, workshops and FabLabs: school students,
teachers and makers who 3D-print, most of them without CAD training. Every text must be clear to a school student on
first reading. Advanced features (STEP/B-Rep, edge fillets and chamfers, sketch extrusion) may use their professional
terms, with the surrounding text saying what they do.

1. **Industry terminology.** Use the terms established in the language's CAD/3D software and standards: the localized
   UIs of Autodesk Fusion / AutoCAD, SolidWorks, Blender, Tinkercad and the national technical standards. When sources
   disagree, prefer the standard, then the most widespread usage. If the established term is unknown to the audience
   (the professional words for camera orbit or pan, "manifold mesh"), use the plain established wording instead
   ("rotate the view", "move the view", "a closed model without holes") — plain, not invented.
2. **No invented words.** No coined terms, literal calques of English, transliterated jargon or words that only make
   sense if you know the English original. If no established term exists, describe the action in plain words.
3. **Clear and unambiguous.** One term per concept and one concept per term across the whole UI. A label must not be
   readable two ways: a word for "cube" for a box with independent width, depth and height is wrong; view zoom and
   object scale must not share a word. Avoid synonyms for the same action in neighbouring controls.
4. **Plain style.** Short sentence-case labels; commands are verbs in the form the language uses for commands, while
   tools, modes and toolbar section labels may be nouns where the language's CAD software does so (see the guide). Messages
   say what happened and what to do next in everyday words, without internal or file-format jargon unless the user must
   act on it. Tutorials: one action per sentence. Address the user politely and consistently, as set in the language
   guide. No slang, no exclamation marks, no humour that doesn't translate.
5. **The language guide is binding.** Use its glossary, typography and form of address; add new recurring terms to it in
   the same pull request. A term you are unsure of goes into the pull request description for review, not into the
   catalog as a guess.

## Catalog format

- Two files per language: `messages.json` for the web app and `desktop.json`, which the desktop app's main process
  reads on its own (plain text with `{placeholders}` only). Messages are nested by the part of the interface they
  belong to (`dashboard`, `editor`, `panels`, `errors`…); code names a message by its path, `editor.notice.ready`.
- Messages use [ICU syntax](https://formatjs.github.io/docs/core-concepts/icu-syntax). `{name}` is replaced by a
  parameter.
- Plurals pick a form by the `count` parameter and the language's
  [CLDR plural categories](https://cldr.unicode.org/index/cldr-spec/plural-rules) (English `one`/`other`; others may add
  `zero`, `two`, `few`, `many`); the test checks them against `Intl.PluralRules`. Write the number as `{count}`, not
  `#`: `#` would format it in the language's style ("0,5"), while the interface shows numbers as typed ("0.5").

  ```json
  "shapeCount": "{count, plural, one {{count} shape} other {{count} shapes}}"
  ```

- `<tag>…</tag>` marks text the UI wraps in an element (bold, keyboard key). Keep the tags, translate the text inside.
- An ASCII apostrophe right before `{`, `}` or `<` starts quoted text in ICU, so write it twice there: `''{name}'` prints
  `'Box'`. Typographic quotes and apostrophes (« », „ “, ’) need nothing.
- A long compound word that does not fit a narrow button can take a soft hyphen, `­`, where it may break:
  `"Schräg­stirnrad"` shows as one word when it fits and as „Schräg-“ / „stirnrad“ when it does not.

## In code

| Need | Use |
|---|---|
| Text in a component | `const t = useTranslations();` → `t("ns.key", { count })`; list `t` in hook deps where it is used |
| Text outside React | `translate("ns.key")`, or `currentTranslator()` / `translatorFor(locale)` for a translator; ask for it when translating |
| Text with markup | `t.rich("ns.key", { b: (chunks) => <strong>{chunks}</strong> })`; an element in the middle of a message is a tag too, not a parameter |
| Error shown to the user | throw `new LocalizedError("errors.…", params)`; display with `errorText(t, error, "ns.fallback")` |
| Error from a worker | post `localizedErrorPayload(error)`, rebuild with `errorFromPayload(payload)` |
| Error from an API route | `errorResponse("errors.…", status)` (`lib/apiErrors.ts`); the page rebuilds it with `errorFromResponse(payload)` |
| Editor status line | `setNotice(notice((t) => t("editor.…", params)))`: shown in the current language, read by MCP in English |
| Unit symbol | `unitLabel(t, "mm")` |
| Date or number | `Intl.*Format(formattingLocale(useLocale()), …)` — keeps the system's regional format |

Everything comes from `@/i18n`, which re-exports the use-intl hooks: only `apps/web/src/i18n` imports use-intl.

English (`locales/en`) is the source: keys are type-checked against it, and a key missing in another language falls back
to English at runtime. Default names of created objects and projects (`Box`, `Key Tag`) stay in English because they
are saved into project files.

MCP stays English whatever the interface language: command results and errors, and the status line text an agent
reads (`englishNotice`). API routes keep their English `error` text and add `errorKey` for the interface.
