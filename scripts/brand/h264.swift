// JPEG frames → H.264 mp4 with macOS's own encoder (AVFoundation), for the egg's loop (scripts/egg-still.ts --loop).
// Playwright's bundled ffmpeg encodes VP9 only, and nothing is downloaded for this. Usage:
//   swift scripts/brand/h264.swift <frames-dir> <out.mp4> <fps>
// The frames are read in name order. High quality (AVVideoQualityKey .95, the encoder's nearest to ffmpeg's -crf 18),
// 4:2:0, every frame a sync frame's worth of quality at about 12 Mbps for 1080p: a 5 s master for an editor, not a stream.
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count == 4, let fps = Int32(args[3]) else { FileHandle.standardError.write("usage: h264.swift <frames-dir> <out.mp4> <fps>\n".data(using: .utf8)!); exit(2) }
let dir = URL(fileURLWithPath: args[1]), out = URL(fileURLWithPath: args[2])
let names = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".jpg") }.sorted()
guard let first = NSImage(contentsOf: dir.appendingPathComponent(names[0])), let cg0 = first.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(3) }
let w = cg0.width, h = cg0.height
try? FileManager.default.removeItem(at: out)
let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
  AVVideoCompressionPropertiesKey: [AVVideoQualityKey: 0.95, AVVideoAverageBitRateKey: 12_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
for (i, n) in names.enumerated() {
  guard let img = NSImage(contentsOf: dir.appendingPathComponent(n)), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(4) }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  guard let buf = pb else { exit(5) }
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: w, height: h, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
  CVPixelBufferUnlockBaseAddress(buf, [])
  while !input.isReadyForMoreMediaData { usleep(1000) }
  adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else { FileHandle.standardError.write("\(writer.error?.localizedDescription ?? "failed")\n".data(using: .utf8)!); exit(6) }
print("(\(names.count) frames, \(w)×\(h), \(fps) fps, H.264)")
