import { beforeEach, describe, expect, it } from "vitest";
import {
  completeSketchForgeMcpCommand,
  dispatchSketchForgeMcpCommand,
  pollSketchForgeMcpCommand,
  registerSketchForgeMcpEditor,
  waitForSketchForgeMcpCommand,
} from "@/lib/sketchforgeMcpStore";

const editor = {
  editorId: "editor-test",
  editorNumber: 12345,
  projectId: "project-test",
  projectName: "MCP test",
  url: "http://localhost:3000/?editor=1",
  focused: true,
  shapeCount: 0,
  selectedCount: 0,
  notice: "",
  lastError: null,
};

beforeEach(() => {
  delete (globalThis as { __sketchforgeMcpStore?: unknown }).__sketchforgeMcpStore;
  registerSketchForgeMcpEditor(editor);
});

describe("SketchForge MCP long polling", () => {
  it("delivers a command directly to a waiting editor", async () => {
    const poll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000 });
    const result = dispatchSketchForgeMcpCommand({ editorId: editor.editorId, action: "list_objects" });

    const command = await poll;
    expect(command).toMatchObject({ action: "list_objects", params: {} });
    expect(pollSketchForgeMcpCommand(editor.editorId)).toBeNull();

    completeSketchForgeMcpCommand(editor.editorId, { commandId: command!.id, ok: true, data: [] });
    await expect(result).resolves.toMatchObject({ commandId: command!.id, ok: true, data: [] });
  });

  it("allows only one pending poll per editor", async () => {
    const firstPoll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000 });
    const secondPoll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000 });

    await expect(firstPoll).resolves.toBeNull();
    const result = dispatchSketchForgeMcpCommand({ editorId: editor.editorId, action: "inspect_errors" });
    const command = await secondPoll;
    expect(command?.action).toBe("inspect_errors");

    completeSketchForgeMcpCommand(editor.editorId, { commandId: command!.id, ok: true });
    await expect(result).resolves.toMatchObject({ commandId: command!.id, ok: true });
  });

  it("removes an aborted poll before queueing the next command", async () => {
    const controller = new AbortController();
    const poll = waitForSketchForgeMcpCommand(editor.editorId, { timeoutMs: 5_000, signal: controller.signal });
    controller.abort();
    await expect(poll).resolves.toBeNull();

    const result = dispatchSketchForgeMcpCommand({ editorId: editor.editorId, action: "get_scene" });
    const command = pollSketchForgeMcpCommand(editor.editorId);
    expect(command?.action).toBe("get_scene");

    completeSketchForgeMcpCommand(editor.editorId, { commandId: command!.id, ok: true });
    await expect(result).resolves.toMatchObject({ commandId: command!.id, ok: true });
  });
});
