export type ProjectExportFormat = "stl" | "obj" | "step" | "svg" | "skf";

const EXPORT_FORMAT_LABEL_KEYS: Record<ProjectExportFormat, string> = {
  stl: "importExport.stl",
  obj: "importExport.obj",
  step: "importExport.step",
  svg: "importExport.svg",
  skf: "importExport.skf",
};

export function exportFormatLabelKey(format: ProjectExportFormat) {
  return EXPORT_FORMAT_LABEL_KEYS[format];
}

export function projectExportFileName(projectName: string, format: ProjectExportFormat) {
  const safeProjectName = projectName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 120);
  return `${safeProjectName || "SketchForge design"}.${format}`;
}
