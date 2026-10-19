/// JavaScript injected into the page. Kept tiny and free of dependencies: they run
/// in the page world before the app's own bundle.
enum BridgeScripts {
    static let handlerName = "sketchforgeNative"

    /// `window.sketchforgeDesktop`, the same contract the Electron preload exposes
    /// (see `apps/web/src/types/desktop.d.ts`).
    static let desktopBridge = """
    (() => {
      const post = (type) => window.webkit.messageHandlers.\(handlerName).postMessage({ type });
      Object.defineProperty(window, "sketchforgeDesktop", {
        value: Object.freeze({
          platform: "macos",
          mcp: true,
          getVersion: () => post("getVersion"),
          checkForUpdates: () => post("checkForUpdates"),
          installUpdate: () => post("installUpdate"),
        }),
        configurable: false,
        enumerable: false,
        writable: false,
      });
    })();
    """

    /// WebKit drops Blob-backed request bodies (a Blob, or FormData holding a File)
    /// on their way to a custom URL scheme handler; strings and ArrayBuffers arrive.
    /// Re-encode such bodies for same-origin requests so binary "Save to folder"
    /// exports (multipart) reach NativeAPI intact. The multipart boundary is kept.
    static let fetchBodyShim = """
    (() => {
      const nativeFetch = window.fetch.bind(window);
      const sameOrigin = (input) => {
        try {
          return new URL(input instanceof Request ? input.url : String(input), location.href).origin === location.origin;
        } catch {
          return false;
        }
      };
      window.fetch = async function fetch(input, init) {
        const body = init && init.body;
        if (body && (body instanceof Blob || body instanceof FormData) && sameOrigin(input)) {
          const encoded = new Response(body);
          const headers = new Headers(init.headers || undefined);
          const type = encoded.headers.get("content-type");
          if (type && !headers.has("content-type")) headers.set("content-type", type);
          init = { ...init, headers, body: await encoded.arrayBuffer() };
        }
        return nativeFetch(input, init);
      };
    })();
    """

    /// Reports the color of the page's top edge so the native title bar can blend
    /// into whatever header is showing (blue dashboard bar, light editor ribbon,
    /// dark theme). Debounced; costs one elementFromPoint per change burst.
    static let chromeColorReporter = """
    (() => {
      let last = "";
      let timer = 0;
      const opaque = (color) => color && color !== "transparent" && !/rgba\\([^)]*,\\s*0\\)$/.test(color);
      const sample = () => {
        timer = 0;
        let element = document.elementFromPoint(Math.max(1, innerWidth / 2), 1);
        let color = "";
        for (; element; element = element.parentElement) {
          const candidate = getComputedStyle(element).backgroundColor;
          if (opaque(candidate)) { color = candidate; break; }
        }
        color = color || getComputedStyle(document.body).backgroundColor;
        if (color && color !== last) {
          last = color;
          window.webkit.messageHandlers.\(handlerName).postMessage({ type: "chromeColor", color });
        }
      };
      const schedule = () => { if (!timer) timer = setTimeout(sample, 120); };
      const start = () => {
        new MutationObserver(schedule).observe(document.documentElement, {
          subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-theme"],
        });
        addEventListener("resize", schedule);
        matchMedia("(prefers-color-scheme: dark)").addEventListener("change", schedule);
        sample();
      };
      if (document.readyState === "loading") addEventListener("DOMContentLoaded", start, { once: true });
      else start();
    })();
    """

    /// Desktop polish that does not need upstream changes: a macOS folder hint for
    /// Settings ▸ Save to folder (whose placeholder is a Windows path).
    static let desktopPolish = """
    (() => {
      let timer = 0;
      const fix = () => {
        timer = 0;
        document.querySelectorAll('input[placeholder^="C:\\\\\\\\Users"]').forEach((input) => {
          input.placeholder = "~/Downloads/SketchForge";
        });
      };
      new MutationObserver(() => { if (!timer) timer = setTimeout(fix, 250); })
        .observe(document.documentElement, { subtree: true, childList: true });
    })();
    """

    /// Hands files opened from Finder / File ▸ Open to the dashboard's own import
    /// input, which already accepts .skf, STL, OBJ, STEP and SVG.
    static let openFiles = """
    // The input is in the prerendered HTML; wait until React has hydrated it, or the
    // change event would fire before anyone listens.
    const hydrated = (element) => element && Object.keys(element).some((key) => key.startsWith("__reactProps"));
    let input = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      input = document.querySelector('input[type="file"][multiple][accept*=".skf"]');
      if (hydrated(input)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!hydrated(input)) return "not-ready";
    const files = await Promise.all(items.map(async (item) => {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error("Could not read " + item.name);
      return new File([await response.blob()], item.name, { lastModified: item.modified });
    }));
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return "ok";
    """

    /// Gives the editor's own lifecycle handlers a chance to persist state before quit.
    static let prepareForQuit = """
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
    """
}
