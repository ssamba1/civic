"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

type BlurIntensity = "sm" | "md" | "lg" | "xl";
type ShadowIntensity = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
type GlowIntensity = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface LiquidGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  blurIntensity?: BlurIntensity;
  shadowIntensity?: ShadowIntensity;
  glowIntensity?: GlowIntensity;
  borderRadius?: string;
}

// Functional glass only — a backdrop blur so floating overlays (map controls,
// the assistant panel) stay legible over busy content beneath. The former
// "liquid" SVG refraction + white-inset highlights + colored glow are gone.
const blurClasses: Record<BlurIntensity, string> = {
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
};

// Quiet neutral elevation. Kept token-shaped so intensity props stay meaningful
// for callers, but every value is a plain gray shadow — no color, no glow.
const shadowStyles: Record<ShadowIntensity, string> = {
  none: "none",
  xs: "0 1px 2px rgba(0, 0, 0, 0.05)",
  sm: "0 2px 6px rgba(0, 0, 0, 0.07)",
  md: "0 4px 12px rgba(0, 0, 0, 0.09)",
  lg: "0 8px 20px rgba(0, 0, 0, 0.11)",
  xl: "0 12px 28px rgba(0, 0, 0, 0.13)",
  "2xl": "0 16px 36px rgba(0, 0, 0, 0.15)",
};

const glowStyles: Record<GlowIntensity, string> = {
  none: "none",
  xs: "0 0 0 1px rgba(0, 0, 0, 0.02)",
  sm: "0 1px 2px rgba(0, 0, 0, 0.04)",
  md: "0 2px 8px rgba(0, 0, 0, 0.06)",
  lg: "0 4px 16px rgba(0, 0, 0, 0.08)",
  xl: "0 6px 24px rgba(0, 0, 0, 0.1)",
  "2xl": "0 8px 32px rgba(0, 0, 0, 0.12)",
};

export const LiquidGlassCard = React.forwardRef<
  HTMLDivElement,
  LiquidGlassCardProps
>(function LiquidGlassCard(
  {
    children,
    className,
    contentClassName,
    blurIntensity = "md",
    shadowIntensity = "sm",
    glowIntensity = "none",
    borderRadius = "var(--radius-lg)",
    style,
    ...props
  },
  ref,
) {
  const boxShadow =
    [glowStyles[glowIntensity], shadowStyles[shadowIntensity]]
      .filter((s) => s !== "none")
      .join(", ") || undefined;
  return (
    <div
      ref={ref}
      className={cn(
        "relative max-w-full overflow-hidden border border-hairline bg-glass",
        blurClasses[blurIntensity],
        className,
      )}
      style={{ borderRadius, boxShadow, ...style }}
      {...props}
    >
      <div className={cn("relative h-full w-full", contentClassName)}>
        {children}
      </div>
    </div>
  );
});
