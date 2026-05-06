import CoreImage
import ExpoModulesCore
import ImageIO
import UIKit
import Vision

public class NomiImageCutoutModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NomiImageCutout")

    AsyncFunction("generateCutoutAsync") { (uri: String) throws -> String in
      guard #available(iOS 17.0, *) else {
        throw CutoutError.unsupportedIOS
      }

      let imageURL = try Self.fileURL(from: uri)
      guard let sourceImage = UIImage(contentsOfFile: imageURL.path),
            let cgImage = sourceImage.cgImage else {
        throw CutoutError.imageDecodeFailed
      }

      let request = VNGenerateForegroundInstanceMaskRequest()
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: sourceImage.cgImageOrientation)
      try handler.perform([request])

      guard let observation = request.results?.first else {
        throw CutoutError.maskUnavailable
      }

      let maskBuffer = try observation.generateScaledMaskForImage(
        forInstances: observation.allInstances,
        from: handler
      )

      let context = CIContext()
      let foreground = CIImage(cgImage: cgImage)
      let mask = CIImage(cvPixelBuffer: maskBuffer)
      let transparentBackground = CIImage(color: .clear).cropped(to: foreground.extent)
      let composited = foreground.applyingFilter(
        "CIBlendWithMask",
        parameters: [
          kCIInputBackgroundImageKey: transparentBackground,
          kCIInputMaskImageKey: mask
        ]
      )

      guard let outputCGImage = context.createCGImage(composited, from: foreground.extent) else {
        throw CutoutError.renderFailed
      }

      let outputImage = UIImage(cgImage: outputCGImage, scale: sourceImage.scale, orientation: sourceImage.imageOrientation)
      guard let pngData = outputImage.pngData() else {
        throw CutoutError.renderFailed
      }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("nomi-cutout-\(UUID().uuidString)")
        .appendingPathExtension("png")
      try pngData.write(to: outputURL, options: .atomic)

      return outputURL.absoluteString
    }
  }

  private static func fileURL(from uri: String) throws -> URL {
    if let url = URL(string: uri), url.isFileURL {
      return url
    }

    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }

    throw CutoutError.invalidURI
  }
}

private enum CutoutError: Error {
  case unsupportedIOS
  case invalidURI
  case imageDecodeFailed
  case maskUnavailable
  case renderFailed
}

private extension UIImage {
  var cgImageOrientation: CGImagePropertyOrientation {
    switch imageOrientation {
    case .up:
      return .up
    case .upMirrored:
      return .upMirrored
    case .down:
      return .down
    case .downMirrored:
      return .downMirrored
    case .left:
      return .left
    case .leftMirrored:
      return .leftMirrored
    case .right:
      return .right
    case .rightMirrored:
      return .rightMirrored
    @unknown default:
      return .up
    }
  }
}
