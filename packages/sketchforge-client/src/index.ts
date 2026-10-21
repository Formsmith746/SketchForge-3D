export { SketchForgeClient, ProjectHandle, type SketchForgeClientOptions } from "./client.js";
export { API_ERROR_CODES, SketchForgeApiError, SketchForgeTransportError, type ApiErrorCode, type ApiErrorContext } from "./errors.js";
export { Transport, normalizeBaseUrl, buildUrl, type FetchLike, type RequestSpec, type TransportOptions } from "./http.js";
export { Projects } from "./resources/projects.js";
export { Shapes, chunk, shapePatchFromSummary } from "./resources/shapes.js";
export { Align, Distribute, Patterns } from "./resources/arrange.js";
export { Edges } from "./resources/edges.js";
export { Faces } from "./resources/faces.js";
export { Thickness } from "./resources/thickness.js";
export { Imports } from "./resources/imports.js";
export { Interference } from "./resources/interference.js";
export { Measurements } from "./resources/measurements.js";
export { Mirrors } from "./resources/mirrors.js";
export { Properties } from "./resources/properties.js";
export { Drawings } from "./resources/drawings.js";
export { Shell } from "./resources/shell.js";
export { Treatments } from "./resources/treatments.js";
export {
  BASE_URL_ENV,
  DEFAULT_BASE_URL,
  MissingConfigurationError,
  PROJECT_ENV,
  TOKEN_ENV,
  clientFromEnvironment,
  targetProjectFromEnvironment,
  type Environment,
} from "./environment.js";
export {
  defineMacro,
  macroFromModule,
  macroLayout,
  resolveMacroParams,
  resolveMacroProject,
  runMacro,
  runStamp,
  type MacroContext,
  type MacroDefinition,
  type MacroLayout,
  type MacroParameterValue,
  type MacroProjectMode,
  type MacroProjectSpec,
  type MacroRunReport,
  type ResolvedMacroProject,
} from "./macro.js";
export { centeredOffsets, grid, mm, ring, row, type Point2 } from "./layout.js";
export * from "./types.js";
