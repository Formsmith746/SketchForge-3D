#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const MCP_ROUTE = "/api/sketchforge-mcp";
const baseUrl = process.env.SKETCHFORGE_URL || DEFAULT_BASE_URL;

const editorTargetSchema = {
  type: "object",
  properties: {
    editorNumber: { type: "number", description: "The 5-digit SketchForge editor number from sketchforge_list_editors." },
    editorId: { type: "string", description: "Optional internal editor id. Prefer editorNumber for human-directed use." },
    timeoutMs: { type: "number", description: "Command timeout in milliseconds. Defaults to 15000." },
  },
};

const tools = [
  {
    name: "sketchforge_list_editors",
    description: "List SketchForge editor tabs that are currently open and heartbeating, including editorNumber and projectName.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sketchforge_read_scene",
    description: "Read the current scene, selection, workspace units, and exact object dimensions from an open SketchForge editor.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        includeRawShapes: { type: "boolean", description: "Include raw WorkplaneShape JSON. Can be large for imported meshes." },
      },
    },
  },
  {
    name: "sketchforge_list_objects",
    description: "List all current objects available in the editor with exact dimensions, position, rotation, and object ids.",
    inputSchema: editorTargetSchema,
  },
  {
    name: "sketchforge_select_objects",
    description: "Select objects by id in the SketchForge editor.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["ids"],
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "sketchforge_delete_objects",
    description: "Delete objects by id, or delete the current selection when ids are omitted.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
        id: { type: "string" },
      },
    },
  },
  {
    name: "sketchforge_create_shape",
    description: "Create a box/cube, cylinder, or simple extruded sketch in SketchForge.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["kind"],
      properties: {
        ...editorTargetSchema.properties,
        kind: { type: "string", enum: ["box", "cube", "cylinder", "sketch"] },
        name: { type: "string" },
        color: { type: "string" },
        x: { type: "number" },
        z: { type: "number" },
        elevation: { type: "number" },
        width: { type: "number" },
        depth: { type: "number" },
        height: { type: "number" },
        size: { type: "number" },
        rotation: { type: "number" },
        rotationX: { type: "number" },
        rotationZ: { type: "number" },
        sides: { type: "number" },
      },
    },
  },
  {
    name: "sketchforge_import_mesh",
    description: "Import a triangle mesh into SketchForge from raw position and optional normal arrays.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["positions"],
      properties: {
        ...editorTargetSchema.properties,
        name: { type: "string" },
        color: { type: "string" },
        x: { type: "number" },
        z: { type: "number" },
        elevation: { type: "number" },
        width: { type: "number" },
        depth: { type: "number" },
        height: { type: "number" },
        positions: { type: "array", items: { type: "number" } },
        normals: { type: "array", items: { type: "number" } },
      },
    },
  },
  {
    name: "sketchforge_update_object",
    description: "Update one object's exact dimensions, position, color, name, hole state, or rotations.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["id"],
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
        name: { type: "string" },
        color: { type: "string" },
        hole: { type: "boolean" },
        x: { type: "number" },
        z: { type: "number" },
        elevation: { type: "number" },
        width: { type: "number" },
        depth: { type: "number" },
        height: { type: "number" },
        size: { type: "number" },
        rotation: { type: "number" },
        rotationX: { type: "number" },
        rotationZ: { type: "number" },
      },
    },
  },
  {
    name: "sketchforge_align_objects",
    description: "Align two or more SketchForge objects using the same alignment logic as the editor Alignment button.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["axis", "target"],
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" }, description: "Object ids to align. If omitted, uses the current selection." },
        anchorId: { type: "string", description: "Optional object id to keep fixed as the alignment reference." },
        axis: { type: "string", enum: ["x", "y", "z"], description: "x=left/right, z=front/back, y=bottom/top." },
        target: { type: "string", enum: ["min", "center", "max"], description: "Which side/center to align." },
      },
    },
  },
  {
    name: "sketchforge_group_objects",
    description: "Group objects by id using SketchForge's normal grouping/boolean pipeline.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["ids"],
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "sketchforge_ungroup_objects",
    description: "Ungroup one or more grouped objects by id and preserve their edited geometry.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        ids: { type: "array", items: { type: "string" } },
        id: { type: "string" },
      },
    },
  },
  {
    name: "sketchforge_boolean_cut",
    description: "Cut solids with hole objects. Provide solidIds and holeIds; the result replaces the operands.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["solidIds", "holeIds"],
      properties: {
        ...editorTargetSchema.properties,
        solidIds: { type: "array", items: { type: "string" } },
        holeIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "sketchforge_separate_parts",
    description: "Separate one disconnected multi-part object into independent objects.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
      },
    },
  },
  {
    name: "sketchforge_list_edges",
    description: "List real CAD edge ids for one object so a later chamfer/fillet can target specific edges.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["id"],
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
        sharpAngle: { type: "number" },
      },
    },
  },
  {
    name: "sketchforge_apply_edge_treatment",
    description: "Apply chamfer or fillet to specific edge ids returned by sketchforge_list_edges.",
    inputSchema: {
      ...editorTargetSchema,
      required: ["id", "kind", "edgeIds", "amount"],
      properties: {
        ...editorTargetSchema.properties,
        id: { type: "string" },
        kind: { type: "string", enum: ["chamfer", "fillet"] },
        edgeIds: {
          anyOf: [
            { type: "array", items: { type: "number" } },
            { type: "string", enum: ["all"] },
          ],
        },
        allEdges: { type: "boolean" },
        amount: { type: "number" },
        chamferAngle: { type: "number" },
        sharpAngle: { type: "number" },
        quality: { type: "string", enum: ["draft", "standard", "fine"] },
        preserveEdgeSize: { type: "boolean" },
      },
    },
  },
  {
    name: "sketchforge_inspect_errors",
    description: "Inspect the editor notice, last MCP error, and active edge modifier error.",
    inputSchema: editorTargetSchema,
  },
  {
    name: "sketchforge_capture_image",
    description: "Capture a PNG image of the editor viewport from current/home/top/bottom/front/back/right/left view.",
    inputSchema: {
      ...editorTargetSchema,
      properties: {
        ...editorTargetSchema.properties,
        face: { type: "string", enum: ["current", "home", "top", "bottom", "front", "back", "right", "left"] },
      },
    },
  },
];

function bridgeUrl() {
  return new URL(MCP_ROUTE, baseUrl);
}

async function bridgeGet() {
  const response = await fetch(bridgeUrl());
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `SketchForge bridge returned HTTP ${response.status}`);
  }
  return payload;
}

async function bridgeCommand(action, args = {}, defaultTimeoutMs = 15000) {
  const { editorNumber, editorId, timeoutMs, ...params } = args || {};
  let targetNumber = typeof editorNumber === "number" ? editorNumber : undefined;
  let targetId = typeof editorId === "string" ? editorId : undefined;

  if (!targetNumber && !targetId) {
    const { editors = [] } = await bridgeGet();
    if (editors.length === 1) {
      targetNumber = editors[0].editorNumber;
    } else {
      throw new Error(editors.length === 0 ? "No open SketchForge editors found" : "Provide editorNumber because multiple SketchForge editors are open");
    }
  }

  const response = await fetch(bridgeUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "command",
      editorNumber: targetNumber,
      editorId: targetId,
      action,
      params,
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : defaultTimeoutMs,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) {
    throw new Error(payload?.error || `SketchForge command failed with HTTP ${response.status}`);
  }
  return payload.data;
}

async function callTool(name, args) {
  switch (name) {
    case "sketchforge_list_editors":
      return bridgeGet();
    case "sketchforge_read_scene":
      return bridgeCommand("get_scene", args);
    case "sketchforge_list_objects":
      return bridgeCommand("list_objects", args);
    case "sketchforge_select_objects":
      return bridgeCommand("select_objects", args);
    case "sketchforge_delete_objects":
      return bridgeCommand("delete_objects", args);
    case "sketchforge_create_shape":
      return bridgeCommand("create_shape", args);
    case "sketchforge_import_mesh":
      return bridgeCommand("import_mesh", args, 60000);
    case "sketchforge_update_object":
      return bridgeCommand("update_object", args);
    case "sketchforge_align_objects":
      return bridgeCommand("align_objects", args);
    case "sketchforge_group_objects":
      return bridgeCommand("group_objects", args, 30000);
    case "sketchforge_ungroup_objects":
      return bridgeCommand("ungroup_objects", args);
    case "sketchforge_boolean_cut":
      return bridgeCommand("boolean_cut", args, 45000);
    case "sketchforge_separate_parts":
      return bridgeCommand("separate_parts", args);
    case "sketchforge_list_edges":
      return bridgeCommand("list_edges", args, 30000);
    case "sketchforge_apply_edge_treatment":
      return bridgeCommand("apply_edge_treatment", args, 60000);
    case "sketchforge_inspect_errors":
      return bridgeCommand("inspect_errors", args);
    case "sketchforge_capture_image":
      return bridgeCommand("capture_image", args, 30000);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function textContent(value) {
  return {
    type: "text",
    text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
  };
}

function toolResult(value) {
  if (value?.dataUrl?.startsWith?.("data:image/png;base64,")) {
    return {
      content: [
        textContent({ face: value.face, bytesApprox: value.bytesApprox }),
        {
          type: "image",
          data: value.dataUrl.slice("data:image/png;base64,".length),
          mimeType: "image/png",
        },
      ],
    };
  }
  return { content: [textContent(value)] };
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  const { id, method, params } = message;
  try {
    if (method === "initialize") {
      sendResult(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "sketchforge-mcp", version: "0.1.0" },
      });
      return;
    }
    if (method === "notifications/initialized") {
      return;
    }
    if (method === "ping") {
      sendResult(id, {});
      return;
    }
    if (method === "tools/list") {
      sendResult(id, { tools });
      return;
    }
    if (method === "tools/call") {
      const name = params?.name;
      if (typeof name !== "string") {
        sendError(id, -32602, "Expected tool name");
        return;
      }
      const result = await callTool(name, params?.arguments || {});
      sendResult(id, toolResult(result));
      return;
    }
    if (method === "resources/list") {
      sendResult(id, { resources: [] });
      return;
    }
    sendError(id, -32601, `Unknown method: ${method}`);
  } catch (error) {
    if (method === "tools/call") {
      sendResult(id, { isError: true, content: [textContent(error instanceof Error ? error.message : String(error))] });
      return;
    }
    sendError(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      void handleMessage(JSON.parse(trimmed));
    } catch (error) {
      sendError(null, -32700, error instanceof Error ? error.message : String(error));
    }
  });
});
