"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "light" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const baseStyles =
  "inline-flex items-center justify-center gap-2 font-medium transition-shadow disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3 focus-visible:ring-offset-2 focus-visible:ring-offset-paper select-none";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-ink text-paper border border-ink hover:bg-ink-2 active:bg-ink-2 shadow-atom-1",
  light:
    "bg-bg-elev text-ink border border-line hover:shadow-atom-2 active:shadow-atom-1",
  ghost: "bg-transparent text-ink hover:bg-line",
  danger:
    "bg-reaction-challenge text-paper border border-reaction-challenge hover:opacity-90",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px] rounded-lg",
  md: "h-9 px-3.5 text-sm rounded-lg",
  lg: "h-11 px-5 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "light", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
