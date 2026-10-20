export const PROJECT_THUMBNAIL_IDLE_MS = 2_500;
export const PROJECT_THUMBNAIL_MAX_WIDTH = 512;
export const PROJECT_THUMBNAIL_MAX_HEIGHT = 320;

export type ProjectThumbnailSceneKey = {
  projectId: string;
  fingerprint: string;
};

export function projectThumbnailDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = PROJECT_THUMBNAIL_MAX_WIDTH,
  maxHeight = PROJECT_THUMBNAIL_MAX_HEIGHT,
) {
  const width = Math.max(1, Math.round(Number.isFinite(sourceWidth) ? sourceWidth : 1));
  const height = Math.max(1, Math.round(Number.isFinite(sourceHeight) ? sourceHeight : 1));
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function projectThumbnailSceneChanged(
  previous: ProjectThumbnailSceneKey | null,
  current: ProjectThumbnailSceneKey,
) {
  return previous?.projectId === current.projectId && previous.fingerprint !== current.fingerprint;
}
