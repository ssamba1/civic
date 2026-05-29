"use client";

import { useEffect, useRef } from "react";

/**
 * Hero background shader — ported from the professor-research-app "Riven" hero
 * (originally an @react-three/fiber ShaderMaterial plane). Reimplemented here in
 * dependency-free raw WebGL (no three.js) as a full-bleed fullscreen quad, and
 * recoloured from the original emerald palette to Civic blue → sky → white.
 * Sits behind the hero content (pointer-events none, negative z), feathers into
 * the page background via a radial mask, and freezes on prefers-reduced-motion.
 */

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Fragment logic mirrors the original Riven hero shader: wave-warp the UVs,
// build a layered sin/cos noise field, mix between two colors, blow out the
// noise peaks toward white, then feather the alpha radially.
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
  color = mix(color, vec3(1.0), pow(abs(noise), 2.0) * intensity);

  float d = length(uv - 0.5);
  float alpha = 1.0 - smoothstep(0.28, 0.78, d);

  gl_FragColor = vec4(color, alpha);
}
`;

export function ShaderHero({ className = "" }: { className?: string }) {
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
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);

    // Fullscreen triangle.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "time");
    const uIntensity = gl.getUniformLocation(program, "intensity");
    const uColor1 = gl.getUniformLocation(program, "color1");
    const uColor2 = gl.getUniformLocation(program, "color2");
    gl.uniform3f(uColor1, 0.039, 0.518, 1.0); // #0a84ff Civic accent
    gl.uniform3f(uColor2, 0.6, 0.78, 1.0); // soft sky blue

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

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      // Time scale 0.68 — matches the original's slowed-down drift.
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
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
      style={{
        WebkitMaskImage:
          "radial-gradient(ellipse 130% 120% at center, black 86%, transparent 100%)",
        maskImage:
          "radial-gradient(ellipse 130% 120% at center, black 86%, transparent 100%)",
        opacity: 0.7,
      }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
