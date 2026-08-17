import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchSketchForgeMcpCommand,
  pollSketchForgeMcpCommand,
  registerSketchForgeMcpEditor,
} from "@/lib/sketchforgeMcpStore";

afterEach(() => {
  vi.useRealTimers();
});

function registerEditor(editorId: string) {
  registerSketchForgeMcpEditor({
    editorId,
    editorNumber: 1,
    projectId: null,
    projectName: "Test",
    url: "http://localhost",
    focused: true,
    shapeCount: 1,
    selectedCount: 1,
    notice: "",
    lastError: null,
  });
}

describe("SketchForge MCP command deadlines", () => {
  it("includes the bounded deadline in a command delivered to the editor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    registerEditor("deadline-editor");
    const resultPromise = dispatchSketchForgeMcpCommand({
      editorId: "deadline-editor",
      action: "apply_edge_treatment",
      timeoutMs: 5_000,
    });

    const command = pollSketchForgeMcpCommand("deadline-editor");
    expect(command?.createdAt).toBe(10_000);
    expect(command?.expiresAt).toBe(15_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await resultPromise;
  });

  it("does not deliver a queued command after its caller timed out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    registerEditor("expired-editor");
    const resultPromise = dispatchSketchForgeMcpCommand({
      editorId: "expired-editor",
      action: "apply_edge_treatment",
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(pollSketchForgeMcpCommand("expired-editor")).toBeNull();
  });
});
