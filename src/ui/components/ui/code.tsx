import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

export interface CodeProps extends JSX.HTMLAttributes<HTMLElement> {
  children: ComponentChildren;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "outline" | "ghost" | "surface";
}

const sizeStyles = {
  xs: "px-1 py-0.5 text-xs",
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-1 text-sm",
  lg: "px-2.5 py-1.5 text-base",
};

const variantStyles = {
  outline: "border border-gray-300 dark:border-gray-600 bg-transparent",
  ghost: "bg-transparent",
  surface: "bg-gray-100 dark:bg-gray-800",
};

export function Code({
  children,
  size = "sm",
  variant = "surface",
  className,
  ...rest
}: CodeProps) {
  return (
    <code
      className={cx(
        "inline-flex items-center rounded font-mono",
        "text-gray-800 dark:text-gray-200",
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...rest}
    >
      {children}
    </code>
  );
}
