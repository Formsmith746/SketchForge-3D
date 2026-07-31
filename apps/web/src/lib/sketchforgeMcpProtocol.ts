import type { GridSize, ShapeKind, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

export const SKETCHFORGE_MCP_ROUTE = "/api/sketchforge-mcp";
export const SKETCHFORGE_MCP_STALE_MS = 6500;
export const SKETCHFORGE_MCP_POLL_MS = 220;

export type SketchForgeMcpViewFace = "current" | "home" | "top" | "bottom" | "front" | "back" | "right" | "left";

export type SketchForgeMcpShapeSummary = {
  id: string;
  name: string;
  kind: ShapeKind;
  color: string;
  hole: boolean;
  locked: boolean;
  hidden: boolean;
  position: {
    x: number;
    z: number;
    elevation: number;
  };
  dimensions: {
    width: number;
    depth: number;
    height: number;
    size: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  mirror: {
    x: boolean;
    y: boolean;
    z: boolean;
  };
  edgeTreatments: unknown[];
  groupedCount: number;
  importedTriangles: number;
  cadDisplayEdgeCount: number | null;
  sketchPointCount: number;
  sketchSegmentCount: number;
  children?: SketchForgeMcpShapeSummary[];
};

export type SketchForgeMcpSceneSummary = {
  projectId: string | null;
  projectName: string;
  notice: string;
  selectedIds: string[];
  shapeCount: number;
  workspace: WorkplaneWorkspaceSettings;
  snap: GridSize | null;
  shapes: SketchForgeMcpShapeSummary[];
};

export type SketchForgeMcpEditorSummary = {
  editorId: string;
  editorNumber: number;
  projectId: string | null;
  projectName: string;
  url: string;
  focused: boolean;
  shapeCount: number;
  selectedCount: number;
  notice: string;
  lastError: string | null;
  lastSeen: number;
};

export type SketchForgeMcpCommandName =
  | "get_scene"
  | "list_objects"
  | "select_objects"
  | "delete_objects"
  | "create_shape"
  | "import_mesh"
  | "update_object"
  | "align_objects"
  | "group_objects"
  | "ungroup_objects"
  | "boolean_cut"
  | "separate_parts"
  | "list_edges"
  | "apply_edge_treatment"
  | "inspect_errors"
  | "capture_image";

export type SketchForgeMcpCommand = {
  id: string;
  action: SketchForgeMcpCommandName;
  params: Record<string, unknown>;
  createdAt: number;
};

export type SketchForgeMcpCommandResult = {
  commandId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  completedAt?: number;
};

export type SketchForgeMcpHeartbeatPayload = {
  type: "heartbeat";
  editor: Omit<SketchForgeMcpEditorSummary, "lastSeen">;
};

export type SketchForgeMcpPollPayload = {
  type: "poll";
  editorId: string;
};

export type SketchForgeMcpResultPayload = {
  type: "result";
  editorId: string;
  result: SketchForgeMcpCommandResult;
};

export type SketchForgeMcpDispatchPayload = {
  type: "command";
  editorId?: string;
  editorNumber?: number;
  action: SketchForgeMcpCommandName;
  params?: Record<string, unknown>;
  timeoutMs?: number;
};

export type SketchForgeMcpApiPayload =
  | SketchForgeMcpHeartbeatPayload
  | SketchForgeMcpPollPayload
  | SketchForgeMcpResultPayload
  | SketchForgeMcpDispatchPayload;
