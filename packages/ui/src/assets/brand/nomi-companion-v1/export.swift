// Size, format and exact theme-color exports from one approved imagegen alpha master.
// Run from this directory: swift export.swift
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceURL = root.appendingPathComponent("symbol-master.png")
guard let input = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let source = CGImageSourceCreateImageAtIndex(input, 0, nil) else {
    fatalError("Missing symbol-master.png")
}
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
func canvas(_ width: Int, _ height: Int, opaque: Bool = false) -> CGContext {
    let info = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue : bitmapInfo
    let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                            bytesPerRow: width * 4, space: colorSpace, bitmapInfo: info)!
    context.interpolationQuality = .high
    return context
}
func save(_ context: CGContext, _ name: String) {
    let output = root.appendingPathComponent(name)
    let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    precondition(CGImageDestinationFinalize(destination), "PNG export failed")
}
let inspection = canvas(source.width, source.height)
inspection.draw(source, in: CGRect(x: 0, y: 0, width: source.width, height: source.height))
let pixels = inspection.data!.assumingMemoryBound(to: UInt8.self)
var minX = source.width, minY = source.height, maxX = -1, maxY = -1
var occupied = Set<Int>()
for y in 0..<source.height {
    for x in 0..<source.width where pixels[(y * source.width + x) * 4 + 3] >= 128 {
        minX = min(minX, x); minY = min(minY, y)
        maxX = max(maxX, x); maxY = max(maxY, y)
        occupied.insert(y * source.width + x)
    }
}
precondition(maxX >= minX && maxY >= minY, "Empty master")
var components: [Int] = []
while let first = occupied.first {
    var queue = [first], cursor = 0
    occupied.remove(first)
    while cursor < queue.count {
        let index = queue[cursor]; cursor += 1
        let x = index % source.width, y = index / source.width
        for (nx, ny) in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)] {
            if nx >= 0 && nx < source.width && ny >= 0 && ny < source.height {
                let next = ny * source.width + nx
                if occupied.remove(next) != nil { queue.append(next) }
            }
        }
    }
    components.append(queue.count)
}
print("Alpha bounds:", minX, minY, maxX, maxY, "components:", components.sorted(by: >))
precondition(components.count == 2, "The approved companion master must have exactly two solid forms")
let ink = CGColor(colorSpace: colorSpace, components: [32.0/255, 32.0/255, 32.0/255, 1])!
let white = CGColor(colorSpace: colorSpace, components: [1, 1, 1, 1])!
let extent = Double(max(maxX - minX + 1, maxY - minY + 1))
func symbol(_ context: CGContext, center: CGPoint, extent target: Double, color: CGColor) {
    let scale = target / extent
    let centerX = Double(minX + maxX + 1) / 2
    let centerY = Double(minY + maxY + 1) / 2
    let rect = CGRect(x: center.x - centerX * scale,
                      y: center.y - (Double(source.height) - centerY) * scale,
                      width: Double(source.width) * scale, height: Double(source.height) * scale)
    context.saveGState()
    context.clip(to: rect, mask: source)
    context.setFillColor(color)
    context.fill(rect)
    context.restoreGState()
}
for (name, color) in [("black", ink), ("white", white)] {
    for size in [64, 128, 256, 512, 1024] {
        let context = canvas(size, size)
        symbol(context, center: CGPoint(x: Double(size)/2, y: Double(size)/2), extent: Double(size)*0.84, color: color)
        save(context, "symbol-\(name)-\(size).png")
    }
}
for size in [64, 128, 256, 512, 1024] {
    for (name, bg, fg) in [("dark", ink, white), ("light", white, ink)] {
        let context = canvas(size, size)
        let n = Double(size)
        context.setFillColor(bg)
        context.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: size, height: size),
                               cornerWidth: n*0.22, cornerHeight: n*0.22, transform: nil))
        context.fillPath()
        symbol(context, center: CGPoint(x: n/2, y: n/2), extent: n*0.60, color: fg)
        save(context, "app-icon-\(name)-\(size).png")
    }
}
let ios = canvas(1024, 1024, opaque: true)
ios.setFillColor(ink); ios.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
symbol(ios, center: CGPoint(x: 512, y: 512), extent: 614.4, color: white)
save(ios, "app-icon-ios-1024.png")
let iosSet = root.appendingPathComponent("AppIcon.appiconset")
try FileManager.default.createDirectory(at: iosSet, withIntermediateDirectories: true)
try Data(contentsOf: root.appendingPathComponent("app-icon-ios-1024.png"))
    .write(to: iosSet.appendingPathComponent("nomi-1024.png"))
let contents = """
{"images":[{"filename":"nomi-1024.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}
"""
try contents.write(to: iosSet.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
let iconset = root.appendingPathComponent("Nomi.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for logical in [16, 32, 128, 256, 512] {
    for density in [1, 2] {
        let size = logical*density, n = Double(logical*density)
        let context = canvas(size, size), tile = n*0.805
        context.setFillColor(ink)
        context.addPath(CGPath(roundedRect: CGRect(x: (n-tile)/2, y: (n-tile)/2, width: tile, height: tile),
                               cornerWidth: tile*0.22, cornerHeight: tile*0.22, transform: nil))
        context.fillPath()
        symbol(context, center: CGPoint(x: n/2, y: n/2), extent: tile*0.60, color: white)
        save(context, "Nomi.iconset/icon_\(logical)x\(logical)\(density == 2 ? "@2x" : "").png")
        if size == 1024 { save(context, "app-icon-macos-1024.png") }
    }
}
let preview = canvas(1200, 480)
preview.setFillColor(CGColor(gray: 0.94, alpha: 1)); preview.fill(CGRect(x: 0,y: 0,width: 1200,height: 480))
for (x, bg, fg) in [(60.0, ink, white), (440.0, white, ink), (820.0, ink, white)] {
    preview.setFillColor(bg)
    preview.addPath(CGPath(roundedRect: CGRect(x: x,y: 80,width: 320,height: 320),cornerWidth: 70,cornerHeight: 70,transform: nil))
    preview.fillPath()
    symbol(preview, center: CGPoint(x: x+160,y: 240), extent: 192, color: fg)
}
save(preview, "preview.png")
// Exact paired colors: SVG containers embed one shared PNG alpha mask.
// These are scalable containers, not independently traced vector paths.
let mask = try Data(contentsOf: root.appendingPathComponent("symbol-white-1024.png")).base64EncodedString()
for (name, color) in [("black", "#202020"), ("white", "#ffffff"), ("current", "currentColor")] {
    let svg = """
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><mask id="nomi" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024" style="mask-type:alpha"><image width="1024" height="1024" href="data:image/png;base64,\(mask)"/></mask></defs><rect width="1024" height="1024" fill="\(color)" mask="url(#nomi)"/></svg>
    """
    try svg.write(to: root.appendingPathComponent("symbol-\(name).svg"), atomically: true, encoding: .utf8)
}
// Check exact shared alpha after PNG encoding, not merely source geometry.
func decode(_ name: String) -> CGContext {
    let input = CGImageSourceCreateWithURL(root.appendingPathComponent(name) as CFURL, nil)!
    let image = CGImageSourceCreateImageAtIndex(input, 0, nil)!
    let context = canvas(image.width, image.height)
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return context
}
let blackExport = decode("symbol-black-1024.png")
let whiteExport = decode("symbol-white-1024.png")
let bp = blackExport.data!.assumingMemoryBound(to: UInt8.self)
let wp = whiteExport.data!.assumingMemoryBound(to: UInt8.self)
for index in 0..<(1024*1024) {
    precondition(bp[index*4+3] == wp[index*4+3], "Black/white alpha drift")
    if bp[index*4+3] == 255 {
        precondition(bp[index*4] == 32 && bp[index*4+1] == 32 && bp[index*4+2] == 32, "Incorrect sRGB black")
        precondition(wp[index*4] == 255 && wp[index*4+1] == 255 && wp[index*4+2] == 255, "Incorrect white")
    }
}
let iosSource = CGImageSourceCreateWithURL(root.appendingPathComponent("app-icon-ios-1024.png") as CFURL, nil)!
let iosImage = CGImageSourceCreateImageAtIndex(iosSource, 0, nil)!
precondition(iosImage.alphaInfo == .none || iosImage.alphaInfo == .noneSkipLast || iosImage.alphaInfo == .noneSkipFirst, "iOS PNG must not have an alpha channel")
print("Verified: two forms, exact matching black/white alpha, sRGB colors, opaque iOS PNG.")
