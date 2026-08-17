import type { ManifoldToplevel } from "manifold-3d";

export type ManifoldSolid = ReturnType<ManifoldToplevel["Manifold"]["cube"]>;

export function unionSplitManifoldComponents(runtime: ManifoldToplevel, source: ManifoldSolid) {
  const components = source.decompose();
  if (components.length <= 1) {
    return { solid: source, created: components };
  }

  const union = runtime.Manifold.union(components);
  return {
    solid: union.status() === "NoError" && union.numTri() > 0 ? union : null,
    created: [...components, union],
  };
}
