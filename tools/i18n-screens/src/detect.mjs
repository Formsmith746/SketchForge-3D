/**
 * Runs inside the page (passed to page.evaluate, so it must stay self-contained).
 * Returns every visible piece of text with its box, line count and overflow flags.
 * Elements are keyed by a structural path (tags, first class, sibling index) so the same
 * element can be matched across languages without relying on its text.
 */
export function collectTextLayout(scopeSelector) {
  const root = (scopeSelector && document.querySelector(scopeSelector)) || document.body;
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const CONTAINER = "button, a, label, select, [role=tab], [role=menuitem], [role=option], th, td, li, nav, h1, h2, h3, h4, h5, h6, legend, summary, figcaption";
  const measureCanvas = document.createElement("canvas").getContext("2d");
  const items = [];

  const pathOf = (el) => {
    const parts = [];
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const index = node.parentElement ? Array.prototype.indexOf.call(node.parentElement.children, node) : 0;
      const firstClass = typeof node.className === "string" ? node.className.trim().split(/\s+/)[0] : "";
      parts.unshift(`${node.tagName.toLowerCase()}${firstClass ? `.${firstClass}` : ""}:${index}`);
    }
    return parts.join(">");
  };
  const visibleBox = (el) => {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return null;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return null;
    if (box.bottom <= 0 || box.right <= 0 || box.top >= viewport.h || box.left >= viewport.w) return null;
    return { box, style };
  };
  const toBox = (box) => ({ x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) });
  const textWidth = (text, style) => {
    measureCanvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return measureCanvas.measureText(text).width;
  };
  const contentWidth = (el, style) => el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);

  for (const el of root.querySelectorAll("*")) {
    if (el.closest("select") && el.tagName !== "SELECT") continue;

    // Form controls draw their text themselves: compare the text width with the room they give it.
    if (el.tagName === "SELECT" || ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.placeholder && !el.value)) {
      const visible = visibleBox(el);
      if (!visible) continue;
      const text = el.tagName === "SELECT" ? (el.selectedOptions[0]?.textContent ?? "").trim() : el.placeholder.trim();
      if (!text) continue;
      const arrowRoom = el.tagName === "SELECT" ? 18 : 0;
      items.push({
        path: pathOf(el),
        tag: el.tagName.toLowerCase(),
        text,
        box: toBox(visible.box),
        lines: 1,
        clipped: textWidth(text, visible.style) > contentWidth(el, visible.style) - arrowRoom + 1,
        overflow: false,
        compact: true,
      });
      continue;
    }

    const ownText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!ownText) continue;
    const visible = visibleBox(el);
    if (!visible) continue;
    const { box, style } = visible;

    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5 && rect.height > 0.5);
    const lineTops = [];
    for (const rect of rects) {
      if (!lineTops.some((top) => Math.abs(top - rect.top) < rect.height / 2)) lineTops.push(rect.top);
    }
    const clampedLines = style.webkitLineClamp && style.webkitLineClamp !== "none";
    const clipped =
      (el.scrollWidth > el.clientWidth + 1 && (style.overflowX !== "visible" || style.textOverflow === "ellipsis")) ||
      (clampedLines && el.scrollHeight > el.clientHeight + 1);

    const container = el.closest(CONTAINER);
    let overflow = false;
    if (container) {
      const limit = container.getBoundingClientRect();
      overflow = rects.some((rect) => rect.right > limit.right + 1 || rect.left < limit.left - 1);
    }

    items.push({
      path: pathOf(el),
      tag: el.tagName.toLowerCase(),
      text: ownText.slice(0, 240),
      box: toBox(box),
      lines: Math.max(1, lineTops.length),
      clipped,
      overflow,
      compact: Boolean(container) || /^H[1-6]$/.test(el.tagName),
    });
  }
  return { viewport, items };
}
