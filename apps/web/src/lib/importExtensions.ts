const SUPPORTED_IMPORT_EXTENSIONS = new Set(["stl", "obj", "svg"]);

const IMPORT_EXTENSION_LABEL_KEYS: Record<string, string> = {
  stl: "importExport.stl",
  obj: "importExport.obj",
  svg: "importExport.svg",
};

export function importExtensionLabelKey(ext: string) {
  return IMPORT_EXTENSION_LABEL_KEYS[ext] ?? ext;
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function importExtensionSupported(fileName: string) {
  return SUPPORTED_IMPORT_EXTENSIONS.has(fileExtension(fileName));
}
