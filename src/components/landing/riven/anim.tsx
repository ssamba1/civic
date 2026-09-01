"use client";

// V2 animation primitives, scroll-reveal, stagger, count-up, scroll progress.
// Ported VERBATIM from Riven v2/anim.jsx. framer-motion@12 already a Civic dep.

import {
  useReducedMotion as _useReducedMotion,
  animate as fmAnimate,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export const EASE = [0.22, 0.61, 0.36, 1] as const;

// Landing-page entrance + scroll-reveals are part of the brand experience.
// We deliberately do NOT honor prefers-reduced-motion here.
function useReducedMotion() {
  void _useReducedMotion;
  return false;
}

// ───────── Reveal ─────────
export function Reveal({
  children,
  y = 60,
  delay = 0,
  duration = 0.95,
  blur = 0,
  scale = 0.97,
  amount = 0.05,
  className,
  style,
  as = "div",
  ...rest
}: {
  children?: ReactNode;
  y?: number;
  delay?: number;
  duration?: number;
  blur?: number;
  scale?: number;
  amount?: number;
  className?: string;
  style?: CSSProperties;
  as?: keyof typeof motion;
  [key: string]: unknown;
}) {
  const reduce = useReducedMotion();
  // biome-ignore lint/suspicious/noExplicitAny: motion[as] indexing ported verbatim from Riven
  const MotionTag = ((motion as any)[as] || motion.div) as typeof motion.div;
  if (reduce) {
    const Tag = as as keyof React.JSX.IntrinsicElements;
    return (
      <Tag className={className} style={style} {...rest}>
        {children}
      </Tag>
    );
  }
  const useFilter = blur > 0;
  const initial: Record<string, number | string> = { opacity: 0, y };
  const animate: Record<string, number | string> = { opacity: 1, y: 0 };
  if (scale !== 1) {
    initial.scale = scale;
    animate.scale = 1;
  }
  if (useFilter) {
    initial.filter = `blur(${blur}px)`;
    animate.filter = "blur(0px)";
  }
  return (
    <MotionTag
      className={className}
      style={{ willChange: "transform, opacity", ...style }}
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, amount }}
      transition={{ duration, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

// ───────── Stagger group ─────────
export function StaggerGroup({
  children,
  delayChildren = 0.08,
  stagger = 0.11,
  amount = 0.05,
  className,
  style,
  as = "div",
  ...rest
}: {
  children?: ReactNode;
  delayChildren?: number;
  stagger?: number;
  amount?: number;
  className?: string;
  style?: CSSProperties;
  as?: keyof typeof motion;
  [key: string]: unknown;
}) {
  const reduce = useReducedMotion();
  // biome-ignore lint/suspicious/noExplicitAny: motion[as] indexing ported verbatim from Riven
  const MotionTag = ((motion as any)[as] || motion.div) as typeof motion.div;
  if (reduce) {
    const Tag = as as keyof React.JSX.IntrinsicElements;
    return (
      <Tag className={className} style={style} {...rest}>
        {children}
      </Tag>
    );
  }
  return (
    <MotionTag
      className={className}
      style={style}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        visible: { transition: { delayChildren, staggerChildren: stagger } },
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

// Child of StaggerGroup. Picks up parent variants.
export function StaggerItem({
  children,
  y = 44,
  blur = 0,
  className,
  style,
  as = "div",
  ...rest
}: {
  children?: ReactNode;
  y?: number;
  blur?: number;
  className?: string;
  style?: CSSProperties;
  as?: keyof typeof motion;
  [key: string]: unknown;
}) {
  const reduce = useReducedMotion();
  // biome-ignore lint/suspicious/noExplicitAny: motion[as] indexing ported verbatim from Riven
  const MotionTag = ((motion as any)[as] || motion.div) as typeof motion.div;
  if (reduce) {
    const Tag = as as keyof React.JSX.IntrinsicElements;
    return (
      <Tag className={className} style={style} {...rest}>
        {children}
      </Tag>
    );
  }
  const useFilter = blur > 0;
  const hidden: Record<string, number | string> = { opacity: 0, y };
  const visible: Record<string, unknown> = {
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, ease: EASE },
  };
  if (useFilter) {
    hidden.filter = `blur(${blur}px)`;
    visible.filter = "blur(0px)";
  }
  return (
    <MotionTag
      className={className}
      style={{ willChange: "transform, opacity", ...style }}
      {...rest}
      // biome-ignore lint/suspicious/noExplicitAny: variant shape ported verbatim from Riven
      variants={{ hidden, visible } as any}
    >
      {children}
    </MotionTag>
  );
}

// ───────── CountUp ─────────
export function CountUp({
  to,
  duration = 1.6,
  suffix = "",
  delay = 0.2,
  formatter,
  amount = 0.6,
  ease,
}: {
  to: number;
  duration?: number;
  suffix?: string;
  delay?: number;
  formatter?: (n: number) => string;
  amount?: number;
  ease?: number[];
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount });
  const reduce = useReducedMotion();
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState<number | string>(() =>
    reduce ? to : 0,
  );

  useEffect(() => {
    if (!inView || reduce) return;
    const easing = (ease ?? EASE) as [number, number, number, number];
    const controls = fmAnimate(motionVal, to, {
      duration,
      delay,
      ease: easing,
      onUpdate: (v: number) => {
        const n = Math.round(v);
        setDisplay(formatter ? formatter(n) : n);
      },
    });
    return () => controls.stop();
  }, [inView, to, duration, delay, reduce, motionVal, formatter, ease]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatter
        ? typeof display === "number"
          ? formatter(display)
          : display
        : display}
      {suffix}
    </span>
  );
}

// ───────── Bar fill ─────────
export function AnimatedBar({
  pct,
  className,
  style,
}: {
  pct: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ width: reduce ? `${pct}%` : 0 }}
      animate={inView || reduce ? { width: `${pct}%` } : { width: 0 }}
      transition={{ duration: 1.2, delay: 0.25, ease: EASE }}
    />
  );
}

// ───────── Scroll progress bar ─────────
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
  });
  return (
    <motion.div
      aria-hidden="true"
      className="v2-scroll-progress"
      style={{ scaleX }}
    />
  );
}

// ───────── Parallax wrapper ─────────
export function Parallax({
  children,
  range = 40,
  className,
  style,
}: {
  children?: ReactNode;
  range?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [range, -range]);
  if (reduce) {
    return (
      <div
        ref={ref}
        className={className}
        style={{ position: "relative", ...style }}
      >
        {children}
      </div>
    );
  }
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ position: "relative", ...style, y }}
    >
      {children}
    </motion.div>
  );
}
