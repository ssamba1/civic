"use client";

import { useEffect, useRef, useState } from "react";

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger offset in ms, applied as the CSS animation-delay. */
  delay?: number;
  /** Fraction of the element visible before it fires. */
  threshold?: number;
}

/**
 * Wraps content that should rise + fade in once it scrolls into view.
 * The motion itself lives in globals.css (`.reveal` / `.reveal.is-visible`),
 * so this component only owns the intersection trigger — keeping the page
 * shell a Server Component and the animation off the main thread.
 */
export function Reveal({
  delay = 0,
  threshold = 0.15,
  className = "",
  style,
  children,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={`reveal${visible ? " is-visible" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms`, ...style } as React.CSSProperties}
      {...rest}
    >
      {children}
    </div>
  );
}
