import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

export interface IconButtonProps {
  children: ComponentChildren;
  variant?: "solid" | "outline" | "ghost";
  size?: "xs" | "sm" | "md" | "lg";
  colorPalette?: "blue" | "gray" | "red" | "green";
  loading?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  title?: string;
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  as?: "button" | "span";
  [key: string]: unknown;
}

const variants = {
  solid: {
    blue: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
    gray: "bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-800 dark:bg-gray-500 dark:hover:bg-gray-600",
    red: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
    green: "bg-green-600 text-white hover:bg-green-700 active:bg-green-800",
  },
  outline: {
    blue: "border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20",
    gray: "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800",
    red: "border border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20",
    green: "border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20",
  },
  ghost: {
    blue: "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20",
    gray: "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
    red: "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20",
    green: "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20",
  },
};

const sizes = {
  xs: "w-6 h-6 text-xs",
  sm: "w-8 h-8 text-sm",
  md: "w-10 h-10 text-base",
  lg: "w-12 h-12 text-lg",
};

export function IconButton({
  children,
  variant = "ghost",
  size = "md",
  colorPalette = "gray",
  loading,
  disabled,
  className,
  as = "button",
  ...rest
}: IconButtonProps) {
  const Component = as;

  const buttonClasses = cx(
    "inline-flex items-center justify-center rounded-md",
    "transition-all duration-150 ease-in-out",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    variants[variant][colorPalette],
    sizes[size],
    className
  );

  if (as === "span") {
    return (
      <span className={buttonClasses} {...(rest as JSX.HTMLAttributes<HTMLSpanElement>)}>
        {loading ? (
          <svg
            className="animate-spin h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <title>Loading</title>
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          children
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={buttonClasses}
      {...rest}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <title>Loading</title>
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        children
      )}
    </button>
  );
}
