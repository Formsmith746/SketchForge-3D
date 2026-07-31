import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { createLocalId } from "@/lib/localIds";
import type { WorkplaneShape } from "@/types/sketchforge";

export const MAX_SVG_BYTES = 2 * 1024 * 1024;
export const MAX_SVG_XML_ELEMENTS = 10_000;
export const MAX_SVG_GEOMETRY_ELEMENTS = 2_000;
export const MAX_SVG_PATH_COMMANDS = 50_000;
export const MAX_SVG_TRIANGLES = 200_000;

const SVG_EXTRUSION_DEPTH = 4;
const SVG_CURVE_SEGMENTS = 16;
const MIN_VISIBLE_ALPHA = 1e-6;
const svgLoader = new SVGLoader();

type SvgPathStyle = {
  fill?: string;
  fillOpacity?: number;
  opacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  visibility?: string;
};

export type TriangleSoupAnalysis = {
  triangleCount: number;
  vertexCount: number;
  surfaceArea: number;
  volume: number;
  degenerateTriangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  width: number;
  height: number;
  depth: number;
  volumeTolerance: number;
};

type SvgRing = {
  points: THREE.Vector2[];
  area: number;
  parent: number | null;
  depth: number;
};

function sourceByteLength(source: string) {
  return new TextEncoder().encode(source).byteLength;
}

function attributeValues(source: string, name: string) {
  const values: string[] = [];
  const expression = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "gis");
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source))) values.push(match[2]);
  return values;
}

const SVG_DOCUMENT_TYPE_PATTERN = /<!DOCTYPE\b[^>]*>/gi;
const SVG_11_DOCUMENT_TYPE_PATTERN = /^<!DOCTYPE\s+svg(?:\s+PUBLIC\s+(["'])-\/\/W3C\/\/DTD SVG 1\.1\/\/EN\1\s+(["'])https?:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd\2)?\s*>$/i;

function svgDocumentTypes(source: string) {
  return source.match(SVG_DOCUMENT_TYPE_PATTERN) ?? [];
}

export function normalizeSvgDocumentType(source: string) {
  return source.replace(SVG_DOCUMENT_TYPE_PATTERN, "");
}

export function validateSvgSourcePreflight(source: string) {
  if (!source.trim()) throw new Error("SVG file is empty");
  if (sourceByteLength(source) > MAX_SVG_BYTES) {
    throw new Error(`SVG is too large. The maximum supported size is ${MAX_SVG_BYTES / 1024 / 1024} MB`);
  }
  if (/<!ENTITY/i.test(source)) {
    throw new Error("SVG entities are not supported");
  }

  const documentTypes = svgDocumentTypes(source);
  const documentTypeStarts = source.match(/<!DOCTYPE\b/gi)?.length ?? 0;
  if (documentTypes.length !== documentTypeStarts || documentTypes.some((declaration) => !SVG_11_DOCUMENT_TYPE_PATTERN.test(declaration))) {
    throw new Error("Only the standard SVG 1.1 document type is supported");
  }

  if (/\b(?:width|height|viewBox|d)\s*=\s*(["'])[^"']*\bNaN\b[^"']*\1/i.test(source)) {
    throw new Error("SVG contains invalid NaN geometry. In Tinkercad, make sure the workplane intersects the model before exporting the cross-section");
  }

  const xmlElementCount = source.match(/<[a-z][^!?/\s>]*/gi)?.length ?? 0;
  if (xmlElementCount > MAX_SVG_XML_ELEMENTS) {
    throw new Error(`SVG is too complex (${xmlElementCount} elements; maximum ${MAX_SVG_XML_ELEMENTS})`);
  }

  const geometryElementCount = source.match(/<(?:path|rect|polygon|polyline|circle|ellipse|line|use)\b/gi)?.length ?? 0;
  if (geometryElementCount > MAX_SVG_GEOMETRY_ELEMENTS) {
    throw new Error(`SVG has too many geometry elements (${geometryElementCount}; maximum ${MAX_SVG_GEOMETRY_ELEMENTS})`);
  }

  let pathCommandCount = 0;
  for (const pathData of attributeValues(source, "d")) {
    pathCommandCount += pathData.match(/[MmZzLlHhVvCcSsQqTtAa]/g)?.length ?? 0;
    if (pathCommandCount > MAX_SVG_PATH_COMMANDS) {
      throw new Error(`SVG has too many path commands (maximum ${MAX_SVG_PATH_COMMANDS})`);
    }
  }

  for (const href of [...attributeValues(source, "href"), ...attributeValues(source, "xlink:href")]) {
    if (href && !href.trim().startsWith("#")) {
      throw new Error("SVG external references are not supported; embed referenced artwork in the file");
    }
  }
}

export function normalizeSvgUseReferences(source: string) {
  if (!/<use\b/i.test(source)) return source;

  let normalized = source.replace(/<use\b[^>]*>/gi, (tag) => {
    if (/\bxlink:href\s*=/i.test(tag)) return tag;
    return tag.replace(/\bhref(\s*=)/i, "xlink:href$1");
  });

  if (/\bxlink:href\s*=/i.test(normalized) && !/\bxmlns:xlink\s*=/i.test(normalized)) {
    normalized = normalized.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return normalized;
}

function numericStyleValue(value: unknown, fallback = 1) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fillAlpha(fill: string | undefined) {
  const normalized = fill?.trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent") return normalized ? 0 : 1;

  const shortHexAlpha = normalized.match(/^#[0-9a-f]{3}([0-9a-f])$/i)?.[1];
  if (shortHexAlpha) return Number.parseInt(shortHexAlpha + shortHexAlpha, 16) / 255;
  const longHexAlpha = normalized.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/i)?.[1];
  if (longHexAlpha) return Number.parseInt(longHexAlpha, 16) / 255;

  const functional = normalized.match(/^(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)$/i)?.[1];
  if (!functional) return 1;
  if (functional.trim().endsWith("%")) return Number.parseFloat(functional) / 100;
  return Number.parseFloat(functional);
}

function strokeAlpha(stroke: string | undefined) {
  return stroke ? fillAlpha(stroke) : 0;
}

function elementStyleValue(element: Element, property: string) {
  const style = (element as Element & { style?: CSSStyleDeclaration }).style;
  const fromStyle = style?.getPropertyValue(property);
  if (fromStyle) return fromStyle;
  const camelCase = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const direct = style?.[camelCase as keyof CSSStyleDeclaration];
  return typeof direct === "string" ? direct : element.getAttribute(property);
}

function elementOrAncestorSuppressesRendering(element: Element | null | undefined) {
  let current = element;
  while (current) {
    const display = elementStyleValue(current, "display")?.trim().toLowerCase();
    if (display === "none" || current.hasAttribute("hidden")) return true;
    const opacity = elementStyleValue(current, "opacity");
    if (opacity !== null && opacity !== undefined && numericStyleValue(opacity) <= MIN_VISIBLE_ALPHA) return true;
    current = current.parentElement;
  }
  return false;
}

function pathStyleAndNode(path: THREE.ShapePath) {
  const userData = (path as THREE.ShapePath & { userData?: { style?: SvgPathStyle; node?: Element } }).userData;
  return { style: userData?.style ?? {}, node: userData?.node };
}

function pathIsVisible(path: THREE.ShapePath) {
  const { style, node } = pathStyleAndNode(path);
  const visibility = style.visibility?.trim().toLowerCase();
  if (visibility === "hidden" || visibility === "collapse") return false;
  if (numericStyleValue(style.opacity) <= MIN_VISIBLE_ALPHA) return false;
  return !elementOrAncestorSuppressesRendering(node);
}

function pathHasVisibleFill(path: THREE.ShapePath) {
  if (!pathIsVisible(path)) return false;
  const { style } = pathStyleAndNode(path);
  if (numericStyleValue(style.fillOpacity) <= MIN_VISIBLE_ALPHA) return false;
  return fillAlpha(style.fill) > MIN_VISIBLE_ALPHA;
}

function pathHasVisibleStroke(path: THREE.ShapePath) {
  if (!pathIsVisible(path)) return false;
  const { style } = pathStyleAndNode(path);
  if (numericStyleValue(style.strokeOpacity) <= MIN_VISIBLE_ALPHA) return false;
  if (numericStyleValue(style.strokeWidth, 0) <= MIN_VISIBLE_ALPHA) return false;
  return strokeAlpha(style.stroke) > MIN_VISIBLE_ALPHA;
}

function subPathIsClosed(path: THREE.Path) {
  const points = path.getPoints(SVG_CURVE_SEGMENTS);
  if (points.length < 3) return false;
  if (path.autoClose) return true;
  const extent = points.reduce((largest, point) => Math.max(largest, Math.abs(point.x), Math.abs(point.y)), 1);
  const tolerance = extent * 1e-9;
  return points[0].distanceToSquared(points[points.length - 1]) <= tolerance * tolerance;
}

function extrusionProfileFromPath(path: THREE.ShapePath) {
  if (pathHasVisibleFill(path)) return path;
  if (!pathHasVisibleStroke(path)) return null;
  const closedSubPaths = path.subPaths.filter(subPathIsClosed);
  if (!closedSubPaths.length) return null;

  const profile = new THREE.ShapePath();
  profile.color.copy(path.color);
  profile.subPaths.push(...closedSubPaths);
  const userData = (path as THREE.ShapePath & { userData?: { style?: SvgPathStyle; node?: Element } }).userData;
  (profile as THREE.ShapePath & { userData?: { style?: SvgPathStyle; node?: Element } }).userData = userData;
  return profile;
}

function cleanRingPoints(points: THREE.Vector2[]) {
  const cleaned: THREE.Vector2[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (!cleaned.length || cleaned[cleaned.length - 1].distanceToSquared(point) > 1e-20) cleaned.push(point.clone());
  }
  if (cleaned.length > 1 && cleaned[0].distanceToSquared(cleaned[cleaned.length - 1]) <= 1e-20) cleaned.pop();
  return cleaned;
}

function ringSamplePoint(points: THREE.Vector2[]) {
  const triangles = THREE.ShapeUtils.triangulateShape(points, []);
  const triangle = triangles[0];
  if (!triangle) return points[0].clone();
  return points[triangle[0]].clone().add(points[triangle[1]]).add(points[triangle[2]]).multiplyScalar(1 / 3);
}

function pointOnSegment(point: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2, tolerance: number) {
  const ab = b.clone().sub(a);
  const ap = point.clone().sub(a);
  const cross = Math.abs(ab.x * ap.y - ab.y * ap.x);
  if (cross > tolerance * Math.max(1, ab.length())) return false;
  const dot = ap.dot(ab);
  return dot >= -tolerance && dot <= ab.lengthSq() + tolerance;
}

function pointInRing(point: THREE.Vector2, ring: THREE.Vector2[]) {
  let inside = false;
  const extent = ring.reduce((largest, entry) => Math.max(largest, Math.abs(entry.x), Math.abs(entry.y)), 1);
  const tolerance = extent * 1e-9;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j];
    const b = ring[i];
    if (pointOnSegment(point, a, b, tolerance)) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function orientation(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function ringsIntersect(a: THREE.Vector2[], b: THREE.Vector2[]) {
  const scale = [...a, ...b].reduce((largest, point) => Math.max(largest, Math.abs(point.x), Math.abs(point.y)), 1);
  const tolerance = scale * 1e-9;
  for (let ai = 0; ai < a.length; ai += 1) {
    const a0 = a[ai];
    const a1 = a[(ai + 1) % a.length];
    for (let bi = 0; bi < b.length; bi += 1) {
      const b0 = b[bi];
      const b1 = b[(bi + 1) % b.length];
      const o1 = orientation(a0, a1, b0);
      const o2 = orientation(a0, a1, b1);
      const o3 = orientation(b0, b1, a0);
      const o4 = orientation(b0, b1, a1);
      if (((o1 > tolerance && o2 < -tolerance) || (o1 < -tolerance && o2 > tolerance)) &&
          ((o3 > tolerance && o4 < -tolerance) || (o3 < -tolerance && o4 > tolerance))) return true;
      if (Math.abs(o1) <= tolerance && pointOnSegment(b0, a0, a1, tolerance)) return true;
      if (Math.abs(o2) <= tolerance && pointOnSegment(b1, a0, a1, tolerance)) return true;
      if (Math.abs(o3) <= tolerance && pointOnSegment(a0, b0, b1, tolerance)) return true;
      if (Math.abs(o4) <= tolerance && pointOnSegment(a1, b0, b1, tolerance)) return true;
    }
  }
  return false;
}

function composeNestedRings(shapes: THREE.Shape[]) {
  const rings: SvgRing[] = [];
  for (const shape of shapes) {
    const extracted = shape.extractPoints(SVG_CURVE_SEGMENTS);
    for (const rawPoints of [extracted.shape, ...extracted.holes]) {
      const points = cleanRingPoints(rawPoints);
      if (points.length < 3) continue;
      const area = Math.abs(THREE.ShapeUtils.area(points));
      const extent = points.reduce((largest, point) => Math.max(largest, Math.abs(point.x), Math.abs(point.y)), 1);
      if (!Number.isFinite(area) || area <= (extent * 1e-9) ** 2) {
        continue;
      }
      rings.push({ points, area, parent: null, depth: 0 });
    }
  }

  if (!rings.length) throw new Error("SVG has no readable filled paths");
  rings.sort((a, b) => b.area - a.area);

  for (let index = 0; index < rings.length; index += 1) {
    const ring = rings[index];
    const sample = ringSamplePoint(ring.points);
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      const possibleParent = rings[candidate];
      if (possibleParent.area <= ring.area || !pointInRing(sample, possibleParent.points)) continue;
      if (ringsIntersect(ring.points, possibleParent.points)) continue;
      if (ring.parent === null || possibleParent.area < rings[ring.parent].area) ring.parent = candidate;
    }
    ring.depth = ring.parent === null ? 0 : rings[ring.parent].depth + 1;
  }

  const composed: THREE.Shape[] = [];
  const shapeByRing = new Map<number, THREE.Shape>();
  for (let index = 0; index < rings.length; index += 1) {
    const ring = rings[index];
    if (ring.depth % 2 !== 0) continue;
    const shape = new THREE.Shape(ring.points);
    shape.autoClose = true;
    composed.push(shape);
    shapeByRing.set(index, shape);
  }
  for (let index = 0; index < rings.length; index += 1) {
    const ring = rings[index];
    if (ring.depth % 2 === 0 || ring.parent === null) continue;
    let solidParent: number | null = ring.parent;
    while (solidParent !== null && rings[solidParent].depth % 2 !== 0) solidParent = rings[solidParent].parent;
    const shape = solidParent === null ? undefined : shapeByRing.get(solidParent);
    if (!shape) continue;
    const hole = new THREE.Path(ring.points);
    hole.autoClose = true;
    shape.holes.push(hole);
  }
  return composed;
}

function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function analyzeTriangleSoup(positions: readonly number[]): TriangleSoupAnalysis {
  if (positions.length < 9 || positions.length % 9 !== 0) {
    throw new Error("Mesh does not contain complete triangles");
  }
  if (positions.some((value) => !Number.isFinite(value))) throw new Error("Mesh contains non-finite coordinates");

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  const largestDimension = Math.max(width, height, depth);
  const quantization = Math.max(largestDimension * 1e-7, 1e-9);
  const areaTolerance = quantization * quantization;
  const volumeTolerance = Math.max(width * height * depth * 1e-9, quantization ** 3);

  const vertexIds = new Map<string, number>();
  const parent: number[] = [];
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  const idForVertex = (x: number, y: number, z: number) => {
    const key = `${Math.round(x / quantization)},${Math.round(y / quantization)},${Math.round(z / quantization)}`;
    const existing = vertexIds.get(key);
    if (existing !== undefined) return existing;
    const id = vertexIds.size;
    vertexIds.set(key, id);
    parent.push(id);
    return id;
  };

  const edges = new Map<string, number>();
  const triangleComponents: Array<{ vertex: number; signedVolume: number }> = [];
  let surfaceArea = 0;
  let degenerateTriangles = 0;

  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index];
    const ay = positions[index + 1];
    const az = positions[index + 2];
    const bx = positions[index + 3];
    const by = positions[index + 4];
    const bz = positions[index + 5];
    const cx = positions[index + 6];
    const cy = positions[index + 7];
    const cz = positions[index + 8];
    const a = idForVertex(ax, ay, az);
    const b = idForVertex(bx, by, bz);
    const c = idForVertex(cx, cy, cz);
    union(a, b);
    union(b, c);

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const area = Math.hypot(crossX, crossY, crossZ) / 2;
    if (a === b || b === c || c === a || area <= areaTolerance) degenerateTriangles += 1;
    surfaceArea += area;

    edges.set(edgeKey(a, b), (edges.get(edgeKey(a, b)) ?? 0) + 1);
    edges.set(edgeKey(b, c), (edges.get(edgeKey(b, c)) ?? 0) + 1);
    edges.set(edgeKey(c, a), (edges.get(edgeKey(c, a)) ?? 0) + 1);
    const signedVolume = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    triangleComponents.push({ vertex: a, signedVolume });
  }

  const componentVolumes = new Map<number, number>();
  for (const triangle of triangleComponents) {
    const root = find(triangle.vertex);
    componentVolumes.set(root, (componentVolumes.get(root) ?? 0) + triangle.signedVolume);
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdges += 1;
    else if (count !== 2) nonManifoldEdges += 1;
  }

  return {
    triangleCount: positions.length / 9,
    vertexCount: vertexIds.size,
    surfaceArea,
    volume: [...componentVolumes.values()].reduce((total, value) => total + Math.abs(value), 0),
    degenerateTriangles,
    boundaryEdges,
    nonManifoldEdges,
    width,
    height,
    depth,
    volumeTolerance,
  };
}

export function validateClosedSolidTriangleSoup(positions: readonly number[], label = "SVG") {
  const analysis = analyzeTriangleSoup(positions);
  if (analysis.triangleCount > MAX_SVG_TRIANGLES) {
    throw new Error(`${label} is too complex (${analysis.triangleCount} triangles; maximum ${MAX_SVG_TRIANGLES})`);
  }
  if (analysis.degenerateTriangles > 0) {
    throw new Error(`${label} contains ${analysis.degenerateTriangles} zero-area triangle${analysis.degenerateTriangles === 1 ? "" : "s"}`);
  }
  if (analysis.boundaryEdges > 0 || analysis.nonManifoldEdges > 0) {
    throw new Error(`${label} is not a watertight manifold (${analysis.boundaryEdges} open edge${analysis.boundaryEdges === 1 ? "" : "s"}, ${analysis.nonManifoldEdges} non-manifold edge${analysis.nonManifoldEdges === 1 ? "" : "s"})`);
  }
  if (analysis.width <= 0 || analysis.height <= 0 || analysis.depth <= 0 || analysis.surfaceArea <= 0 || analysis.volume <= analysis.volumeTolerance) {
    throw new Error(`${label} does not enclose a non-zero volume`);
  }
  return analysis;
}

export function buildSvgExtrusionFromPaths(paths: readonly THREE.ShapePath[]) {
  const profilePaths = paths.map(extrusionProfileFromPath).filter((path): path is THREE.ShapePath => Boolean(path));
  if (!profilePaths.length) {
    if (paths.some(pathHasVisibleStroke)) {
      throw new Error("SVG contains only open strokes. Close the paths or convert the strokes to filled outlines before importing");
    }
    throw new Error("SVG has no readable visible filled or closed-stroke paths");
  }

  const sourceShapes = profilePaths.flatMap((path) => SVGLoader.createShapes(path));
  const shapes = composeNestedRings(sourceShapes);
  const rawPositions: number[] = [];
  const acceptedAnalyses: TriangleSoupAnalysis[] = [];

  for (const shape of shapes) {
    const rawGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: SVG_EXTRUSION_DEPTH,
      bevelEnabled: false,
      curveSegments: SVG_CURVE_SEGMENTS,
      steps: 1,
    });
    rawGeometry.rotateX(-Math.PI / 2);
    const geometry = rawGeometry.index ? rawGeometry.toNonIndexed() : rawGeometry;
    const position = geometry.getAttribute("position");
    const candidatePositions: number[] = [];
    for (let index = 0; index < position.count; index += 1) {
      candidatePositions.push(position.getX(index), position.getY(index), position.getZ(index));
    }
    let candidateAnalysis: TriangleSoupAnalysis | null = null;
    try {
      candidateAnalysis = validateClosedSolidTriangleSoup(candidatePositions);
    } catch {
      candidateAnalysis = null;
    }
    if (candidateAnalysis && rawPositions.length / 9 + candidateAnalysis.triangleCount > MAX_SVG_TRIANGLES) {
      if (geometry !== rawGeometry) geometry.dispose();
      rawGeometry.dispose();
      throw new Error(`SVG is too complex (maximum ${MAX_SVG_TRIANGLES} triangles)`);
    }
    if (candidateAnalysis) {
      rawPositions.push(...candidatePositions);
      acceptedAnalyses.push(candidateAnalysis);
    }
    if (geometry !== rawGeometry) geometry.dispose();
    rawGeometry.dispose();
  }

  if (!rawPositions.length) throw new Error("SVG has no filled contours that can be converted into a solid");
  const combinedAnalysis = analyzeTriangleSoup(rawPositions);
  const analysis: TriangleSoupAnalysis = {
    ...combinedAnalysis,
    surfaceArea: acceptedAnalyses.reduce((total, entry) => total + entry.surfaceArea, 0),
    volume: acceptedAnalyses.reduce((total, entry) => total + entry.volume, 0),
    degenerateTriangles: 0,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(rawPositions, 3));
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const rawNormals: number[] = [];
  for (let index = 0; index < normal.count; index += 1) rawNormals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
  geometry.dispose();
  return { rawPositions, rawNormals, analysis };
}

export function importedShapeFromSvg(fileName: string, source: string): WorkplaneShape {
  validateSvgSourcePreflight(source);
  const parsed = svgLoader.parse(normalizeSvgUseReferences(normalizeSvgDocumentType(source)));
  const parsedXml = parsed.xml as unknown as XMLDocument | Element;
  const root = "documentElement" in parsedXml ? parsedXml.documentElement : parsedXml;
  if (root.localName !== "svg" || root.querySelector("parsererror")) {
    throw new Error("SVG is not valid XML");
  }
  const { rawPositions, rawNormals, analysis } = buildSvgExtrusionFromPaths(parsed.paths);
  const centerX = analysis.width / 2;
  const centerZ = analysis.depth / 2;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  for (let index = 0; index < rawPositions.length; index += 3) {
    minX = Math.min(minX, rawPositions[index]);
    minY = Math.min(minY, rawPositions[index + 1]);
    minZ = Math.min(minZ, rawPositions[index + 2]);
  }

  const positions: number[] = [];
  for (let index = 0; index < rawPositions.length; index += 3) {
    positions.push(rawPositions[index] - minX - centerX, rawPositions[index + 1] - minY, rawPositions[index + 2] - minZ - centerZ);
  }

  return {
    id: createLocalId("uploaded-svg"),
    name: fileName.replace(/\.[^.]+$/, "") || "Imported SVG",
    kind: "mesh",
    color: "#0098c7",
    x: 10,
    z: -10,
    size: Math.max(analysis.width, analysis.depth),
    width: analysis.width,
    depth: analysis.depth,
    height: analysis.height,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions,
      normals: rawNormals,
      baseWidth: analysis.width,
      baseDepth: analysis.depth,
      baseHeight: analysis.height,
      triangleCount: analysis.triangleCount,
      sourceFormat: "svg",
    },
    locked: false,
    hidden: false,
  };
}

export function invalidSvgMeshReason(shape: WorkplaneShape) {
  if (shape.importedMesh?.sourceFormat !== "svg") return null;
  try {
    validateClosedSolidTriangleSoup(shape.importedMesh.positions, `SVG mesh "${shape.name}"`);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : `SVG mesh "${shape.name}" is invalid`;
  }
}
