export type SvgProjectionPolygon = ReadonlyArray<readonly [number, number]>;

export type SvgProjectionLayer = {
  name: string;
  color: string;
  polygons: ReadonlyArray<SvgProjectionPolygon>;
};

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgNumber(value: number) {
  const rounded = Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6));
  return String(rounded);
}

function safeFillColor(value: string) {
  return /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^<>]+\))$/i.test(value.trim()) ? value.trim() : "#0098c7";
}

export function toSvgProjection(layers: ReadonlyArray<SvgProjectionLayer>, title = "SketchForge design") {
  const cleanLayers = layers.flatMap((layer) => {
    const polygons = layer.polygons.filter(
      (polygon) => polygon.length >= 3 && polygon.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    );
    return polygons.length ? [{ ...layer, polygons }] : [];
  });
  let pointCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  cleanLayers.forEach((layer) => layer.polygons.forEach((polygon) => polygon.forEach(([x, y]) => {
    pointCount += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  })));
  if (!pointCount) throw new Error("SVG projection contains no readable contours");

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) throw new Error("SVG projection does not enclose a visible area");

  const body = cleanLayers.map((layer) => {
    const pathData = layer.polygons
      .map((polygon) => polygon.map(([x, y], index) => `${index === 0 ? "M" : "L"}${svgNumber(x)} ${svgNumber(y)}`).join(" ") + " Z")
      .join(" ");
    return `  <path data-name="${xmlEscape(layer.name)}" d="${pathData}" fill="${safeFillColor(layer.color)}" fill-rule="evenodd"/>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${svgNumber(width)}mm" height="${svgNumber(height)}mm" viewBox="${svgNumber(minX)} ${svgNumber(minY)} ${svgNumber(width)} ${svgNumber(height)}">`,
    `  <title>${xmlEscape(title)}</title>`,
    "  <desc>Top-view vector projection exported by SketchForge</desc>",
    ...body,
    "</svg>",
  ].join("\n");
}
