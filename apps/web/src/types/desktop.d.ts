export {};

type SketchForgeDesktopUpdateResult = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloaded: boolean;
  checkedAt: string;
  error?: string;
};

declare global {
  interface Window {
    sketchforgeDesktop?: {
      getVersion: () => Promise<string>;
      checkForUpdates: () => Promise<SketchForgeDesktopUpdateResult>;
      installUpdate: () => Promise<SketchForgeDesktopUpdateResult>;
    };
  }
}
