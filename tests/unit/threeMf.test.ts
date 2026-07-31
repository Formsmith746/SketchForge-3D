import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportMeshesTo3mf, importedShapeFrom3mf } from "@/lib/threeMf";

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("3MF export", () => {
  it("creates a standard package with print coordinates, names, and colors", () => {
    const bytes = exportMeshesTo3mf([{
      name: 'Bracket & cap "A"',
      color: "#1a2b3c",
      vertices: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
      faces: [[0, 1, 2]],
    }], "Fixture <v2>");
    const files = unzipSync(bytes);

    expect(Object.keys(files).sort()).toEqual(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
    expect(strFromU8(files["_rels/.rels"])).toContain('Target="/3D/3dmodel.model"');

    const model = strFromU8(files["3D/3dmodel.model"]);
    expect(model).toContain('<model unit="millimeter"');
    expect(model).toContain('<metadata name="Title">Fixture &lt;v2&gt;</metadata>');
    expect(model).toContain('name="Bracket &amp; cap &quot;A&quot;"');
    expect(model).toContain('displaycolor="#1A2B3CFF"');
    expect(model).toContain('<vertex x="1" y="-3" z="2"/>');
    expect(model).toContain('<triangle v1="0" v2="1" v3="2"/>');
    expect(model).toContain('<item objectid="2"/>');
  });

  it("rejects empty meshes and invalid triangle references", () => {
    expect(() => exportMeshesTo3mf([])).toThrow("Add a solid shape");
    expect(() => exportMeshesTo3mf([{
      name: "Broken",
      vertices: [[0, 0, 0]],
      faces: [[0, 1, 2]],
    }])).toThrow("invalid triangle");
  });

  it("rejects inconsistent ZIP entry counts before expansion", () => {
    const bytes = exportMeshesTo3mf([{
      name: "Triangle",
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [[0, 1, 2]],
    }]);
    const corrupted = new Uint8Array(bytes);
    const view = new DataView(corrupted.buffer);
    let directoryOffset = corrupted.byteLength - 22;
    while (directoryOffset >= 0 && view.getUint32(directoryOffset, true) !== 0x06054b50) directoryOffset -= 1;
    const totalEntries = view.getUint16(directoryOffset + 10, true);
    view.setUint16(directoryOffset + 8, totalEntries + 1, true);

    expect(() => importedShapeFrom3mf("unsafe.3mf", exactArrayBuffer(corrupted))).toThrow("Multi-disk 3MF packages are not supported");
  });
});
