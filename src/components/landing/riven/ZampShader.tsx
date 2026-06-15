"use client";

import { useEffect, useRef } from "react";

/**
 * Zamp hero background — a full-bleed liquid field that covers the entire hero
 * viewport edge-to-edge (content sits on top). Copy of
 * src/components/landing/shader-hero.tsx (raw dependency-free WebGL, no
 * three.js) with three deliberate differences for the zamp composition:
 *   1. the radial alpha mask is REMOVED — alpha is 1.0 everywhere, so the
 *      field is opaque and full-coverage rather than feathered in the middle;
 *   2. the wrapper mask-image / opacity are REMOVED — the canvas fills inset:0;
 *   3. the colors are tuned to a saturated Civic blue (mirrors how the live
 *      Riven zamp hero reads as white blobs on a rich green wash).
 * The original shader-hero.tsx is left untouched.
 */

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Fragment logic mirrors shader-hero.tsx: wave-warp the UVs, build a layered
// sin/cos noise field, mix between two colors, blow out the noise peaks toward
// white. The radial-feather alpha is dropped — alpha is a flat 1.0 so the field
// fully covers the hero.
const FRAG = `
precision highp float;
uniform float time;
uniform float intensity;
uniform vec3 color1;
uniform vec3 color2;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  uv.y += sin(uv.x * 10.0 + time) * 0.02 * intensity;
  uv.x += cos(uv.y * 8.0 + time * 1.5) * 0.012 * intensity;

  float noise = sin(uv.x * 41.0 + time) * cos(uv.y * 31.0 + time * 0.8);
  noise += sin(uv.x * 70.0 - time * 2.0) * cos(uv.y * 50.0 + time * 1.2) * 0.5;

  vec3 color = mix(color1, color2, noise * 0.5 + 0.5);
  // White blowout on the noise peaks — pushed harder than the masked hero so
  // it reads as bright white blobs on the rich blue base.
  color = mix(color, vec3(1.0), pow(abs(noise), 2.0) * intensity);

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function ZampShader({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("shader create failed");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    // `useProgram` is the WebGL context method, not a React hook — call it via
    // a bound alias so the linter's `use*` hook heuristic doesn't flag it.
    const activateProgram = gl.useProgram.bind(gl);
    activateProgram(program);

    // Fullscreen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "time");
    const uIntensity = gl.getUniformLocation(program, "intensity");
    const uColor1 = gl.getUniformLocation(program, "color1");
    const uColor2 = gl.getUniformLocation(program, "color2");
    // color1 = saturated Civic blue (#0a84ff). color2 = lighter sky/white-
    // leaning blue so the field reads as white blobs over rich blue.
    gl.uniform3f(uColor1, 0.039, 0.518, 1.0); // #0a84ff — maps Riven's #10B981
    gl.uniform3f(uColor2, 0.737, 0.863, 1.0); // #BCDCFF — maps Riven's #A7F3D0

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const t = ((now - start) / 1000) * 0.68;
      gl.uniform1f(uTime, t);
      gl.uniform1f(uIntensity, 1.0 + Math.sin(t * 2.0) * 0.3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    if (reduce) {
      gl.uniform1f(uTime, 1.6);
      gl.uniform1f(uIntensity, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      data-hero-bg="shader"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
