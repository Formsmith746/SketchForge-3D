import type { Transport } from "../http.js";
import type { SectionDrawingArtifact, SectionDrawingRequest, SectionDxfArtifact } from "../types.js";

export class Drawings {
  constructor(private readonly transport: Transport) {}

  /** Return exact CAD section contours from one named axis plane as SVG. */
  async section(projectId: string, request: SectionDrawingRequest): Promise<SectionDrawingArtifact> {
    const payload = await this.transport.send<{
      filename: string;
      mimeType: "image/svg+xml";
      bytes: number;
      shapeCount: number;
      base64: string;
    }>({
      method: "POST",
      path: "/exports",
      query: { projectId },
      body: { format: "svg", section: { plane: request.plane, offset: request.offset }, ...(request.shapeIds ? { shapeIds: request.shapeIds } : {}), ...(request.name === undefined ? {} : { name: request.name }) },
    });
    const binary = globalThis.atob(payload.base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return { filename: payload.filename, mimeType: payload.mimeType, bytes: payload.bytes, shapeCount: payload.shapeCount, svg: new TextDecoder().decode(bytes) };
  }

  async dxf(projectId: string, request: SectionDrawingRequest): Promise<SectionDxfArtifact> {
    const payload = await this.transport.send<{
      filename: string; mimeType: "application/dxf"; bytes: number; shapeCount: number; base64: string;
    }>({
      method: "POST", path: "/exports", query: { projectId },
      body: { format: "dxf", section: { plane: request.plane, offset: request.offset }, ...(request.shapeIds ? { shapeIds: request.shapeIds } : {}), ...(request.name === undefined ? {} : { name: request.name }) },
    });
    const binary = globalThis.atob(payload.base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return { filename: payload.filename, mimeType: payload.mimeType, bytes: payload.bytes, shapeCount: payload.shapeCount, dxf: new TextDecoder().decode(bytes) };
  }
}
