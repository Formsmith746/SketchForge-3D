import { describe, expect, it } from "vitest";
import { translatorFor, englishNotice, errorFromResponse, notice, type MessageKey, type MessageParams } from "@/i18n";

const ru = translatorFor("ru");
const english = (key: MessageKey, params?: MessageParams) => englishNotice(notice((t) => t(key, params)));

describe("status line notices", () => {
  it("read in English for MCP and in the chosen language in the UI", () => {
    const aligned = notice((t) => t("editor.mcp.aligned", { count: 2, direction: t("editor.align.direction.left") }));

    expect(englishNotice(aligned)).toBe("MCP aligned 2 objects left");
    expect(aligned.text(ru)).toBe("MCP: выровнены 2 объекта по левому краю");
  });

  it("keep the English wording MCP clients already read", () => {
    expect(english("editor.mcp.selected", { count: 1 })).toBe("MCP selected 1 object");
    expect(english("editor.mcp.selected", { count: 3 })).toBe("MCP selected 3 objects");
    expect(english("editor.mcp.selectionCleared")).toBe("MCP cleared selection");
    expect(english("editor.mcp.deleted", { count: 2 })).toBe("MCP deleted 2 objects");
    expect(english("editor.mcp.added", { name: "Box" })).toBe("Box added by MCP");
    expect(english("editor.mcp.imported", { name: "bracket.stl" })).toBe("bracket.stl imported by MCP");
    expect(english("editor.mcp.updated", { name: "Box" })).toBe("Box updated by MCP");
    expect(english("editor.mcp.alreadyAligned", { direction: "middle" })).toBe("MCP alignment already middle");
    expect(english("editor.mcp.grouped", { count: 2 })).toBe("MCP grouped 2 objects");
    expect(english("editor.mcp.groupConsumedSolid")).toBe("MCP group consumed solid");
    expect(english("editor.mcp.ungrouped", { count: 1 })).toBe("MCP ungrouped 1 group");
    expect(english("editor.mcp.cutComplete")).toBe("MCP boolean cut complete");
    expect(english("editor.mcp.cutConsumedSolid")).toBe("MCP cut consumed solid");
    expect(english("editor.mcp.separated", { count: 3 })).toBe("MCP separated 3 parts");
    expect(english("editor.mcp.filleted", { count: 1 })).toBe("Filleted 1 edge by MCP");
    expect(english("editor.mcp.chamfered", { count: 4 })).toBe("Chamfered 4 edges by MCP");
  });
});

describe("API error responses", () => {
  it("keep a message without a key as it is", () => {
    expect(errorFromResponse({ error: "fetch failed" })?.message).toBe("fetch failed");
    expect(errorFromResponse({})).toBeNull();
    expect(errorFromResponse(null)).toBeNull();
  });
});
