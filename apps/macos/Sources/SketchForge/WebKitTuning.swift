import Foundation
import WebKit

/// Performance switches that WebKit exposes only through its internal feature list.
/// Each one is looked up by key at runtime and skipped when the running macOS does
/// not have it, so the app degrades to stock WebKit behavior instead of failing.
enum WebKitTuning {
    /// WebKit throttles `requestAnimationFrame` to 60 Hz even on 120 Hz ProMotion
    /// displays. Turning this preference off lets the 3D viewport run at the
    /// display's native refresh rate (measured: 60 → 120 fps on an M5 Pro).
    private static let overrides: [String: Bool] = [
        "PreferPageRenderingUpdatesNear60FPSEnabled": false,
    ]

    static func apply(to preferences: WKPreferences) {
        let featuresSelector = NSSelectorFromString("_features")
        let setSelector = NSSelectorFromString("_setEnabled:forFeature:")
        guard WKPreferences.responds(to: featuresSelector),
              preferences.responds(to: setSelector),
              let features = (WKPreferences.self as AnyObject).perform(featuresSelector)?.takeUnretainedValue() as? [NSObject]
        else { return }

        typealias SetEnabled = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
        let setEnabled = unsafeBitCast(preferences.method(for: setSelector), to: SetEnabled.self)
        for feature in features {
            guard let key = feature.value(forKey: "key") as? String, let enabled = overrides[key] else { continue }
            setEnabled(preferences, setSelector, enabled, feature)
        }
    }
}
