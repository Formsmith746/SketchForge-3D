const MAX_DOCUMENT_DEPTH = 32;
const MAX_DOCUMENT_NODES = 500_000;
const MAX_ARRAY_ITEMS = 500_000;
const MAX_OBJECT_KEYS = 512;
const MAX_SHAPES = 10_000;
const MAX_HISTORY_ENTRIES = 50;
const MAX_STRING_LENGTH = 8 * 1024 * 1024;

const SHAPE_KINDS = new Set([
  "box", "cylinder", "sphere", "sketch", "scribble", "cone", "pyramid", "roof", "text",
  "roundRoof", "halfSphere", "torus", "tube", "ring", "wedge", "polygon", "icosahedron", "mesh",
]);

const SNAP_VALUES = new Set(["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"]);
const ROOT_KEYS = new Set(["formatVersion", "shapes", "workspace", "snap", "history", "historyIndex", "expectedVersion"]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SOURCE_FORMATS = new Set(["stl", "obj", "svg", "json", "step"]);
const MAX_ABSOLUTE_NUMBER = 1_000_000_000_000;
const MAX_JAVASCRIPT_TIMESTAMP_MS = 8_640_000_000_000_000;

export type ProjectValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedJsonValue(value: unknown) {
  let nodes = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  while (stack.length) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_DOCUMENT_NODES) return false;
    if (current.depth > MAX_DOCUMENT_DEPTH) return false;
    if (current.value === null || typeof current.value === "boolean") continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return false;
      continue;
    }
    if (typeof current.value === "string") {
      if (current.value.length > MAX_STRING_LENGTH) return false;
      continue;
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_ARRAY_ITEMS) return false;
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], depth: current.depth + 1 });
      }
      continue;
    }
    if (!isRecord(current.value)) return false;
    const entries = Object.entries(current.value);
    if (entries.length > MAX_OBJECT_KEYS) return false;
    for (const [key, child] of entries) {
      if (UNSAFE_KEYS.has(key)) return false;
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return true;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_ABSOLUTE_NUMBER;
}

function validTimestampMilliseconds(value: unknown) {
  return Number.isSafeInteger(value)
    && Number(value) >= 0
    && Number(value) <= MAX_JAVASCRIPT_TIMESTAMP_MS;
}

function optionalFields(record: Record<string, unknown>, fields: readonly string[], predicate: (value: unknown) => boolean) {
  return fields.every((field) => !(field in record) || predicate(record[field]));
}

function stringValue(value: unknown) {
  return typeof value === "string";
}

function finiteNumberArray(value: unknown, multiple = 1) {
  return Array.isArray(value) && value.length % multiple === 0 && value.every(finiteNumber);
}

function validEdgeFeature(value: unknown) {
  if (!isRecord(value) || !["fillet", "chamfer"].includes(String(value.kind))) return false;
  if (!finiteNumber(value.amount) || !Number.isSafeInteger(value.edgeCount) || Number(value.edgeCount) < 0) return false;
  return !("chamferAngle" in value) || finiteNumber(value.chamferAngle);
}

function validFrame(value: unknown) {
  if (!isRecord(value)) return false;
  if (!["x", "z", "elevation", "width", "depth", "height"].every((field) => finiteNumber(value[field]))) return false;
  return !("sourceTransform" in value) || finiteNumberArray(value.sourceTransform);
}

function validSketchProfile(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.points) || !Array.isArray(value.segments)) return false;
  if (!value.points.every((point) => isRecord(point)
    && stringValue(point.id) && finiteNumber(point.x) && finiteNumber(point.z)
    && optionalFields(point, ["mode"], (mode) => ["corner", "smooth", "split"].includes(String(mode)))
    && optionalFields(point, ["handleIn", "handleOut"], (handle) => isRecord(handle) && finiteNumber(handle.x) && finiteNumber(handle.z)))) return false;
  if (!value.segments.every((segment) => isRecord(segment)
    && stringValue(segment.id) && stringValue(segment.startId) && stringValue(segment.endId)
    && optionalFields(segment, ["kind"], (kind) => ["line", "bezier", "smooth"].includes(String(kind))))) return false;
  if ("images" in value && (!Array.isArray(value.images) || !value.images.every((image) => isRecord(image)
    && ["id", "name", "dataUrl", "mimeType"].every((field) => stringValue(image[field]))
    && ["pixelWidth", "pixelHeight", "x", "z", "width", "depth"].every((field) => finiteNumber(image[field]))
    && optionalFields(image, ["opacity"], finiteNumber)
    && optionalFields(image, ["lockAspect"], (entry) => typeof entry === "boolean")))) return false;
  return true;
}

function validShape(shape: unknown, depth = 0): boolean {
  if (depth > MAX_DOCUMENT_DEPTH || !isRecord(shape)) return false;
  if (typeof shape.id !== "string" || !shape.id || shape.id.length > 200) return false;
  if (typeof shape.name !== "string" || shape.name.length > 500) return false;
  if (typeof shape.kind !== "string" || !SHAPE_KINDS.has(shape.kind)) return false;
  if (typeof shape.color !== "string" || shape.color.length > 100) return false;
  for (const field of ["x", "z", "size", "width", "depth", "height", "rotation"] as const) {
    if (!finiteNumber(shape[field])) return false;
  }
  if (!optionalFields(shape, ["elevation", "rotationX", "rotationZ", "radius", "steps", "sides", "bevel", "segments", "topRadius", "baseRadius", "groupedBaseWidth", "groupedBaseDepth", "groupedBaseHeight"], finiteNumber)) return false;
  if (!optionalFields(shape, ["hole", "mirrorX", "mirrorY", "mirrorZ", "locked", "hidden"], (value) => typeof value === "boolean")) return false;
  if (!optionalFields(shape, ["text", "font", "cadBrep"], stringValue)) return false;
  if ("edgeResizeMode" in shape && !["scale", "preserve"].includes(String(shape.edgeResizeMode))) return false;
  if ("cadDisplayEdgesVersion" in shape && shape.cadDisplayEdgesVersion !== 2) return false;
  if ("importedMesh" in shape) {
    const mesh = shape.importedMesh;
    if (!isRecord(mesh) || !finiteNumberArray(mesh.positions, 9)
      || !["baseWidth", "baseDepth", "baseHeight"].every((field) => finiteNumber(mesh[field]))
      || !Number.isSafeInteger(mesh.triangleCount) || Number(mesh.triangleCount) < 0
      || typeof mesh.sourceFormat !== "string" || !SOURCE_FORMATS.has(mesh.sourceFormat)
      || ("normals" in mesh && (!finiteNumberArray(mesh.normals, 3) || (mesh.normals as unknown[]).length !== (mesh.positions as unknown[]).length))
      || ("brepStep" in mesh && !stringValue(mesh.brepStep))) return false;
  }
  if ("imagePlate" in shape) {
    const image = shape.imagePlate;
    if (!isRecord(image) || !stringValue(image.dataUrl) || !stringValue(image.mimeType)
      || !finiteNumber(image.pixelWidth) || !finiteNumber(image.pixelHeight)) return false;
  }
  if ("sketchProfile" in shape && !validSketchProfile(shape.sketchProfile)) return false;
  if ("edgeTreatments" in shape && (!Array.isArray(shape.edgeTreatments) || !shape.edgeTreatments.every(validEdgeFeature))) return false;
  if ("edgeTreatmentHistory" in shape && (!Array.isArray(shape.edgeTreatmentHistory) || !shape.edgeTreatmentHistory.every((entry) => isRecord(entry)
    && stringValue(entry.id) && validTimestampMilliseconds(entry.createdAt) && validEdgeFeature(entry.feature) && validShape(entry.before, depth + 1)))) return false;
  if ("cadDisplayEdges" in shape && (!Array.isArray(shape.cadDisplayEdges) || !shape.cadDisplayEdges.every((edge) => isRecord(edge) && finiteNumberArray(edge.points, 3)))) return false;
  if ("cadBrepFrame" in shape && !validFrame(shape.cadBrepFrame)) return false;
  if ("cadPrimitiveFrame" in shape) {
    const primitive = shape.cadPrimitiveFrame;
    if (!isRecord(primitive) || primitive.kind !== "box"
      || !["width", "depth", "height"].every((field) => finiteNumber(primitive[field])) || !validFrame(primitive.frame)) return false;
  }
  if ("groupedShapes" in shape && (!Array.isArray(shape.groupedShapes) || !shape.groupedShapes.every((entry) => validShape(entry, depth + 1)))) return false;
  return true;
}

function validWorkspace(value: unknown) {
  if (value === null || value === undefined) return true;
  if (!isRecord(value)) return false;
  if (!["width", "depth", "gridBlockSize", "zoomSpeed"].every((field) => finiteNumber(value[field]))) return false;
  if (!["sizePreset", "gridBlockPreset", "background", "units", "scale"].every((field) => stringValue(value[field]))) return false;
  if (!["showShadows", "showGrid", "cruiseShapes"].every((field) => typeof value[field] === "boolean")) return false;
  return value.accuracy === 1 || value.accuracy === 2 || value.accuracy === 3;
}

export function validateProjectDocument(value: unknown): ProjectValidationResult {
  if (!isRecord(value)) return { valid: false, reason: "DOCUMENT_NOT_OBJECT" };
  if (Object.keys(value).some((key) => !ROOT_KEYS.has(key))) return { valid: false, reason: "UNKNOWN_ROOT_FIELD" };
  if (value.formatVersion !== 1) return { valid: false, reason: "UNSUPPORTED_FORMAT_VERSION" };
  if (!Array.isArray(value.shapes) || value.shapes.length > MAX_SHAPES) return { valid: false, reason: "INVALID_SHAPES" };
  if (!value.shapes.every((shape) => validShape(shape))) return { valid: false, reason: "INVALID_SHAPE" };
  if ("history" in value || "historyIndex" in value) {
    if (!Array.isArray(value.history) || value.history.length < 1 || value.history.length > MAX_HISTORY_ENTRIES) {
      return { valid: false, reason: "INVALID_HISTORY" };
    }
    if (!value.history.every((snapshot) => Array.isArray(snapshot)
      && snapshot.length <= MAX_SHAPES
      && snapshot.every((shape) => validShape(shape)))) {
      return { valid: false, reason: "INVALID_HISTORY_SHAPE" };
    }
    if (!Number.isSafeInteger(value.historyIndex)
      || Number(value.historyIndex) < 0
      || Number(value.historyIndex) >= value.history.length) {
      return { valid: false, reason: "INVALID_HISTORY_INDEX" };
    }
  }
  if (!validWorkspace(value.workspace)) return { valid: false, reason: "INVALID_WORKSPACE" };
  if (value.snap !== undefined && value.snap !== null && (typeof value.snap !== "string" || !SNAP_VALUES.has(value.snap))) {
    return { valid: false, reason: "INVALID_SNAP" };
  }
  if ("expectedVersion" in value && (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1)) {
    return { valid: false, reason: "INVALID_EXPECTED_VERSION" };
  }
  return boundedJsonValue(value) ? { valid: true } : { valid: false, reason: "DOCUMENT_LIMIT_EXCEEDED" };
}

export const PROJECT_DOCUMENT_LIMITS = {
  maxDepth: MAX_DOCUMENT_DEPTH,
  maxNodes: MAX_DOCUMENT_NODES,
  maxArrayItems: MAX_ARRAY_ITEMS,
  maxShapes: MAX_SHAPES,
  maxHistoryEntries: MAX_HISTORY_ENTRIES,
} as const;
