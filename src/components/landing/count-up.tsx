"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts the numeric portion of a stat string up from 0 on scroll-enter,
 * preserving any non-numeric prefix/suffix (e.g. "$0.0007", "3.1M", "1.4s").
 * Static fallback (the final value) renders for prefers-reduced-motion and SSR.
 */
export function CountUp({
  value,
  duration = 1400,
}: {
  value: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    // Recompute inside the effect — a top-level match() returns a fresh array
    // each render, which (in the dep list) would restart the animation every
    // setDisplay and pin the value near 0.
    const match = value.match(/^(\D*)([\d.,]+)(.*)$/);
    if (!match) return;
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const prefix = match[1];
    const numStr = match[2].replace(/,/g, "");
    const suffix = match[3];
    const target = parseFloat(numStr);
    if (Number.isNaN(target)) return;
    const dot = numStr.indexOf(".");
    const decimals = dot === -1 ? 0 : numStr.length - dot - 1;

    let raf = 0;
    let start = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const run = () => {
      setDisplay(`${prefix}${(0).toFixed(decimals)}${suffix}`);
      const step = (now: number) => {
        if (!start) start = now;
        const p = Math.min((now - start) / duration, 1);
        const current = (target * ease(p)).toFixed(decimals);
        setDisplay(`${prefix}${current}${suffix}`);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(node);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return <span ref={ref}>{display}</span>;
}
