import type { Transport } from "../http.js";
import type { ShapeWriteResult } from "../types.js";

export class Explosions {
  constructor(private readonly transport: Transport) {}
  explode(projectId: string, shapeId: string): Promise<ShapeWriteResult> {
    return this.transport.send<ShapeWriteResult>({
      method: "POST", path: "/explode", query: { projectId, shapeId }, body: {}, retryable: true,
    });
  }
}
