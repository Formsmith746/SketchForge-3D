import { SAME_TEXT_ALLOWED } from "./config.mjs";

const hasWords = (text) => /\p{L}{2,}/u.test(text);
const allowedSame = (text) => SAME_TEXT_ALLOWED.some((pattern) => pattern.test(text.trim()));

/**
 * Issues for one screen in one language, compared with the same screen in the baseline language.
 * Elements are matched by their structural path; elements that only exist in one language are skipped.
 */
export function compareScreen({ layout, baselineLayout, lang, baseline, findKeys }) {
  const baselineByPath = new Map((baselineLayout?.items ?? []).map((item) => [item.path, item]));
  const issues = [];
  const add = (category, item, base, detail) => {
    issues.push({
      id: `${category}:${item.path}`,
      category,
      text: item.text,
      baselineText: base?.text ?? null,
      box: item.box,
      lines: item.lines,
      baselineLines: base?.lines ?? null,
      baselineBox: base?.box ?? null,
      path: item.path,
      tag: item.tag,
      detail,
      keys: findKeys(lang, item.text),
    });
  };

  for (const item of layout.items) {
    const base = baselineByPath.get(item.path);
    if (item.clipped) add(base?.clipped ? "baseline" : "clipped", item, base, "text is wider than the space it is given");
    if (item.overflow) add(base?.overflow ? "baseline" : "overflow", item, base, "text extends past its button or cell");
    if (lang === baseline || !base) continue;
    if (item.compact && item.lines > base.lines) {
      add("wrap", item, base, `${item.lines} lines instead of ${base.lines}`);
    }
    if (item.text === base.text && hasWords(item.text) && !allowedSame(item.text)) {
      add("same", item, base, "same text as the baseline language");
    }
  }
  return issues;
}
