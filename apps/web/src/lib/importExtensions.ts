const SUPPORTED_IMPORT_EXTENSIONS = new Set(["3mf", "stl", "obj", "svg"]);

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function importExtensionSupported(fileName: string) {
  return SUPPORTED_IMPORT_EXTENSIONS.has(fileExtension(fileName));
}
