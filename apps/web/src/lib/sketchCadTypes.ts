import type { SketchProfile } from "@/types/sketchforge";

export type SketchCadBuildRequest = {
  type: "build";
  requestId: number;
  profile: SketchProfile;
  height: number;
};

export type SketchCadBuildResponse =
  | {
      type: "built";
      requestId: number;
      positions: Float32Array;
      normals: Float32Array;
      indices: Uint32Array;
      triangleCount: number;
      brep: string;
    }
  | { type: "error"; requestId: number; message: string };
