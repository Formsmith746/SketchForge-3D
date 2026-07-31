export type ProjectExportFormat = "stl" | "obj" | "step" | "svg" | "skf";

export function projectExportFileName(projectName: string, format: ProjectExportFormat) {
  const safeProjectName = projectName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 120);
  return `${safeProjectName || "SketchForge design"}.${format}`;
}
