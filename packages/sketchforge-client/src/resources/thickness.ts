import type { Transport } from "../http.js";
import type { WallThicknessEstimate } from "../types.js";

export class Thickness {
  constructor(private readonly transport: Transport) {}
  async estimate(projectId: string, shapeId: string): Promise<WallThicknessEstimate> {
    const result = await this.transport.send<{ thickness: WallThicknessEstimate }>({
      method: "GET", path: "/thickness", query: { projectId, shapeId },
    });
    return result.thickness;
  }
}
