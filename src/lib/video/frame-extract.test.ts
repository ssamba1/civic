import { describe, expect, it } from "vitest";
import {
  buildGray8Args,
  buildRawRgbArgs,
  buildSampleArgs,
  frameIndexToSeconds,
} from "./frame-extract";

describe("ffmpeg arg builders", () => {
  it("sample args carry input, fps filter, and output pattern", () => {
    const args = buildSampleArgs("/tmp/clip.mp4", "/tmp/out/frame_%06d.jpg", 2);
    expect(args).toContain("/tmp/clip.mp4");
    expect(args).toContain("fps=2");
    expect(args[args.length - 1]).toBe("/tmp/out/frame_%06d.jpg");
  });

  it("raw RGB args request rgb24 rawvideo at the model size on stdout", () => {
    const args = buildRawRgbArgs("/tmp/f.jpg", 640);
    expect(args).toContain("scale=640:640");
    expect(args).toContain("rgb24");
    expect(args[args.length - 1]).toBe("pipe:1");
  });

  it("gray args request 8×8 gray rawvideo", () => {
    const args = buildGray8Args("/tmp/f.jpg");
    expect(args).toContain("scale=8:8");
    expect(args).toContain("gray");
  });
});

describe("frameIndexToSeconds", () => {
  it("maps 1-based frame index through the sampling fps", () => {
    expect(frameIndexToSeconds(1, 1)).toBe(0);
    expect(frameIndexToSeconds(4, 1)).toBe(3);
    expect(frameIndexToSeconds(4, 2)).toBe(1.5);
  });
});
