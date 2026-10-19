// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "SketchForgeMac",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "SketchForge",
            path: "Sources/SketchForge",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("WebKit"),
                .linkedFramework("Security"),
                .linkedFramework("UniformTypeIdentifiers"),
                .unsafeFlags(["-Xlinker", "-dead_strip"]),
            ]
        ),
    ]
)
