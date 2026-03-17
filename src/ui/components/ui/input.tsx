import { JSX } from "preact";
import { cx } from "../utils";

export type InputSize = "sm" | "md" | "lg";
export type InputVariant = "outline" | "filled" | "flushed";

export interface InputProps {
  size?: InputSize;
  variant?: InputVariant;
  isInvalid?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  type?: string;
  value?: string | number;
  placeholder?: string;
  onChange?: JSX.GenericEventHandler<HTMLInputElement>;
  onInput?: JSX.GenericEventHandler<HTMLInputElement>;
  className?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  name?: string;
  id?: string;
  [key: string]: unknown;
}

const sizeStyles: Record<InputSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-4 text-base",
};

const variantStyles: Record<InputVariant, string> = {
  outline: "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md",
  filled: "border-transparent bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600",
  flushed: "border-b border-gray-300 dark:border-gray-600 rounded-none bg-transparent px-0",
};

export function Input({
  size = "md",
  variant = "outline",
  isInvalid,
  isDisabled,
  isReadOnly,
  disabled,
  readOnly,
  className,
  ...rest
}: InputProps) {
  const actualDisabled = isDisabled ?? disabled;
  const actualReadOnly = isReadOnly ?? readOnly;

  return (
    <input
      disabled={actualDisabled}
      readOnly={actualReadOnly}
      className={cx(
        "w-full transition-colors duration-150",
        "text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "read-only:bg-gray-50 dark:read-only:bg-gray-900/50",
        sizeStyles[size],
        variantStyles[variant],
        isInvalid && "border-red-500 dark:border-red-400 focus:ring-red-500",
        className
      )}
      {...rest}
    />
  );
}

export type InputProps_Alias = InputProps;
