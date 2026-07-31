export type FileImportProgress = {
  fileName: string;
  phase: string;
  percent: number;
};

type ProgressWindow = {
  startPercent?: number;
  endPercent?: number;
};

type ProgressListener = (percent: number) => void;

function readFile(
  file: File,
  mode: "arrayBuffer" | "text",
  onProgress: ProgressListener,
  options: ProgressWindow,
) {
  const start = Math.max(0, Math.min(100, options.startPercent ?? 3));
  const end = Math.max(start, Math.min(100, options.endPercent ?? 58));
  return new Promise<ArrayBuffer | string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadstart = () => onProgress(start);
    reader.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const fraction = Math.max(0, Math.min(1, event.loaded / event.total));
      onProgress(Math.round(start + (end - start) * fraction));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.onabort = () => reject(new Error(`Reading ${file.name} was canceled.`));
    reader.onload = () => {
      onProgress(end);
      if (typeof reader.result === "string" || reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error(`Could not read ${file.name}.`));
      }
    };
    if (mode === "text") reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export async function readFileAsArrayBufferWithProgress(
  file: File,
  onProgress: ProgressListener,
  options: ProgressWindow = {},
) {
  return await readFile(file, "arrayBuffer", onProgress, options) as ArrayBuffer;
}

export async function readFileAsTextWithProgress(
  file: File,
  onProgress: ProgressListener,
  options: ProgressWindow = {},
) {
  return await readFile(file, "text", onProgress, options) as string;
}

export function waitForImportProgressPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}
