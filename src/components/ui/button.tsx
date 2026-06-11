import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background-color,box-shadow,transform] duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px data-[loading=true]:pointer-events-none data-[loading=true]:opacity-70 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-foreground)] text-[var(--color-background)] hover:bg-[var(--color-foreground)]/90 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.12)]",
        accent:
          "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-[0_1px_2px_rgba(10,132,255,0.12),0_10px_28px_-10px_rgba(10,132,255,0.45)]",
        outline:
          "border border-[var(--color-border)] bg-[var(--color-background)]/60 backdrop-blur-sm text-[var(--color-foreground)] hover:bg-[var(--color-surface)]",
        ghost:
          "text-[var(--color-foreground)] hover:bg-[var(--color-surface)]",
      },
      size: {
        default: "h-10 min-h-11 md:min-h-0 px-5",
        sm: "h-8 min-h-11 md:min-h-0 px-3.5 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "h-9 w-9 min-h-11 min-w-11 md:min-h-0 md:min-w-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, dims the label, and blocks interaction during async work. */
  isPending?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isPending, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // asChild forwards a single child element — can't inject a sibling spinner
    // without breaking Slot's single-child contract, so skip the overlay there.
    const showSpinner = isPending && !asChild;
    return (
      <Comp
        ref={ref}
        data-loading={isPending ? "true" : undefined}
        aria-busy={isPending || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {showSpinner ? (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2 className="motion-safe:animate-spin" />
            </span>
            <span className="invisible inline-flex items-center gap-2">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
