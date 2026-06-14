/**
 * Type declarations for the Shape Detection API (FaceDetector).
 * Spec: https://wicg.github.io/shape-detection-api/#face-detection-api
 *
 * Available in Chromium-based browsers behind a flag or by default (Chrome 70+).
 * Not available in Firefox or Safari as of 2025.
 */

interface FaceDetectorOptions {
  maxDetectedFaces?: number;
  fastMode?: boolean;
}

interface DetectedFace {
  boundingBox: DOMRectReadOnly;
  landmarks: Array<{
    locations: Array<{ x: number; y: number }>;
    type: "eye" | "mouth" | "nose";
  }>;
}

declare class FaceDetector {
  constructor(options?: FaceDetectorOptions);
  detect(image: ImageBitmapSource): Promise<DetectedFace[]>;
}

// Augment globalThis so `globalThis.FaceDetector` type-checks
// biome-ignore lint/suspicious/noRedeclare: ambient class (type) + var (feature-detectable value) merging
declare var FaceDetector:
  | {
      new (options?: FaceDetectorOptions): FaceDetector;
      prototype: FaceDetector;
    }
  | undefined;
