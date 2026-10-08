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
      /** Locale code resolved by the web UI; the main process uses it for tray and dialog text. */
      setLanguage: (locale: string) => void;
    };
  }
}
