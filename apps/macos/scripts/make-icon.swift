// Renders the macOS app icon set from the white SketchForge mark:
//   swift make-icon.swift <logo-white.png> <output.iconset>
// The tile follows the macOS icon grid (824 pt superellipse on a 1024 pt canvas)
// with the brand blue gradient, a soft top light and a drop shadow.
import AppKit

let arguments = CommandLine.arguments
guard arguments.count == 3, let logo = NSImage(contentsOfFile: arguments[1]) else {
    FileHandle.standardError.write("usage: make-icon.swift <logo-white.png> <output.iconset>\n".data(using: .utf8)!)
    exit(1)
}
let output = URL(fileURLWithPath: arguments[2], isDirectory: true)
try? FileManager.default.removeItem(at: output)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func superellipse(in rect: CGRect, exponent n: CGFloat = 5) -> CGPath {
    let path = CGMutablePath()
    let a = rect.width / 2, b = rect.height / 2
    let center = CGPoint(x: rect.midX, y: rect.midY)
    let steps = 720
    for step in 0...steps {
        let t = CGFloat(step) / CGFloat(steps) * 2 * .pi
        let c = cos(t), s = sin(t)
        let x = center.x + a * (c < 0 ? -1 : 1) * pow(abs(c), 2 / n)
        let y = center.y + b * (s < 0 ? -1 : 1) * pow(abs(s), 2 / n)
        step == 0 ? path.move(to: CGPoint(x: x, y: y)) : path.addLine(to: CGPoint(x: x, y: y))
    }
    path.closeSubpath()
    return path
}

func render(pixels: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let cg = context.cgContext
    let scale = CGFloat(pixels) / 1024
    cg.scaleBy(x: scale, y: scale)
    cg.interpolationQuality = .high

    let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
    let shape = superellipse(in: tile)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!

    // Drop shadow under the tile.
    cg.saveGState()
    cg.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: CGColor(gray: 0, alpha: 0.32))
    cg.addPath(shape)
    cg.setFillColor(CGColor(srgbRed: 0.05, green: 0.36, blue: 0.86, alpha: 1))
    cg.fillPath()
    cg.restoreGState()

    // Brand gradient, lighter at the top.
    cg.saveGState()
    cg.addPath(shape)
    cg.clip()
    let gradient = CGGradient(colorsSpace: space, colors: [
        CGColor(srgbRed: 0.31, green: 0.58, blue: 1.00, alpha: 1),
        CGColor(srgbRed: 0.09, green: 0.43, blue: 0.96, alpha: 1),
        CGColor(srgbRed: 0.03, green: 0.29, blue: 0.78, alpha: 1),
    ] as CFArray, locations: [0, 0.5, 1])!
    cg.drawLinearGradient(gradient, start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100), options: [])

    // Faint blueprint grid, a nod to the workplane.
    cg.setStrokeColor(CGColor(gray: 1, alpha: 0.07))
    cg.setLineWidth(2)
    for offset in stride(from: CGFloat(100), through: 924, by: 68.7) {
        cg.move(to: CGPoint(x: offset, y: 100)); cg.addLine(to: CGPoint(x: offset, y: 924))
        cg.move(to: CGPoint(x: 100, y: offset)); cg.addLine(to: CGPoint(x: 924, y: offset))
    }
    cg.strokePath()

    // Soft top light.
    let light = CGGradient(colorsSpace: space, colors: [CGColor(gray: 1, alpha: 0.20), CGColor(gray: 1, alpha: 0)] as CFArray, locations: [0, 1])!
    cg.drawLinearGradient(light, start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 560), options: [])
    cg.restoreGState()

    // Hairline edge.
    cg.addPath(shape)
    cg.setStrokeColor(CGColor(gray: 1, alpha: 0.18))
    cg.setLineWidth(3)
    cg.strokePath()

    // The SF mark with a gentle shadow so it lifts off the tile.
    cg.saveGState()
    cg.setShadow(offset: CGSize(width: 0, height: -8), blur: 18, color: CGColor(srgbRed: 0, green: 0.12, blue: 0.4, alpha: 0.45))
    let mark = CGRect(x: 512 - 330, y: 512 - 330 - 6, width: 660, height: 660)
    logo.draw(in: mark, from: .zero, operation: .sourceOver, fraction: 1)
    cg.restoreGState()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for points in [16, 32, 128, 256, 512] {
    for multiplier in [1, 2] {
        let name = multiplier == 1 ? "icon_\(points)x\(points).png" : "icon_\(points)x\(points)@2x.png"
        try render(pixels: points * multiplier).write(to: output.appendingPathComponent(name))
    }
}
