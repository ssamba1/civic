"use client";

import { useEffect, useRef } from "react";

export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const update = () => {
      const scrolled = window.scrollY;
      const total =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      const pct = total > 0 ? scrolled / total : 0;
      bar.style.transform = `scaleX(${pct})`;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-label="Page scroll progress"
      aria-valuemin={0}
      aria-valuemax={100}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] pointer-events-none"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left bg-[var(--color-primary)]"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

interface AnimatedBarProps {
  pct: number;
  className?: string;
}

export function AnimatedBar({ pct, className }: AnimatedBarProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const reducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;

    if (reducedMotion) {
      fill.style.width = `${pct}%`;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fill.style.width = `${pct}%`;
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(fill.parentElement ?? fill);
    return () => observer.disconnect();
  }, [pct, reducedMotion]);

  return (
    <div
      className={`h-[6px] w-full overflow-hidden rounded-full bg-[var(--color-primary-light)]${className ? ` ${className}` : ""}`}
    >
      <div
        ref={fillRef}
        className="h-full rounded-full bg-[var(--color-primary)]"
        style={{
          width: reducedMotion ? `${pct}%` : "0%",
          transition: reducedMotion
            ? "none"
            : "width 1.2s cubic-bezier(0.22,0.61,0.36,1) 0.25s",
        }}
      />
    </div>
  );
}
