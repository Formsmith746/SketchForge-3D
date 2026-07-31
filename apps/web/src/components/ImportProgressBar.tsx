import type { FileImportProgress } from "@/lib/fileImportProgress";

export function ImportProgressBar({
  progress,
  className = "",
}: {
  progress: FileImportProgress;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  return (
    <div className={`file-import-progress ${className}`.trim()} aria-live="polite">
      <div className="file-import-progress-copy">
        <strong>{progress.phase}</strong>
        <span>{percent}%</span>
      </div>
      <div
        className="file-import-progress-track"
        role="progressbar"
        aria-label={`${progress.fileName}: ${progress.phase}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <small title={progress.fileName}>{progress.fileName}</small>
    </div>
  );
}
