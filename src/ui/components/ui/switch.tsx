import { ComponentChildren, JSX, createContext } from "preact";
import { useState, useContext, useCallback } from "preact/hooks";
import { cx } from "../utils";

// Switch Context
interface SwitchContextValue {
  checked: boolean;
  disabled: boolean;
}

const SwitchContext = createContext<SwitchContextValue | null>(null);

function useSwitchContext() {
  const context = useContext(SwitchContext);
  if (!context) {
    throw new Error("Switch components must be used within a Switch.Root");
  }
  return context;
}

// Root
export interface SwitchRootProps {
  children?: ComponentChildren;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** Alias for onChange (backward compatibility) */
  onCheckedChange?: (details: { checked: boolean }) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  [key: string]: unknown;
}

const sizeStyles = {
  sm: {
    track: "w-7 h-4",
    thumb: "w-3 h-3",
    translate: "translate-x-3",
  },
  md: {
    track: "w-9 h-5",
    thumb: "w-4 h-4",
    translate: "translate-x-4",
  },
  lg: {
    track: "w-11 h-6",
    thumb: "w-5 h-5",
    translate: "translate-x-5",
  },
};

export function Root({
  children,
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  onCheckedChange,
  disabled = false,
  size = "md",
  className,
  ...rest
}: SwitchRootProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = controlledChecked !== undefined;
  const checked = isControlled ? controlledChecked : internalChecked;

  const handleChange = useCallback(() => {
    if (disabled) return;
    const newChecked = !checked;
    if (!isControlled) {
      setInternalChecked(newChecked);
    }
    onChange?.(newChecked);
    onCheckedChange?.({ checked: newChecked });
  }, [checked, isControlled, onChange, onCheckedChange, disabled]);

  const styles = sizeStyles[size];

  return (
    <SwitchContext.Provider value={{ checked, disabled }}>
      <label
        className={cx(
          "inline-flex items-center gap-2 cursor-pointer select-none",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        {...rest}
      >
        <span className="relative inline-flex items-center">
          <input
            type="checkbox"
            role="switch"
            checked={checked}
            disabled={disabled}
            onChange={handleChange}
            className="sr-only peer"
            aria-checked={checked}
          />
          <span
            className={cx(
              styles.track,
              "rounded-full transition-colors duration-200",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2",
              checked
                ? "bg-accent"
                : "bg-bg-muted"
            )}
          >
            <span
              className={cx(
                styles.thumb,
                "absolute top-0.5 left-0.5 rounded-full bg-white shadow-sm",
                "transition-transform duration-200",
                checked && styles.translate
              )}
            />
          </span>
        </span>
        {children}
      </label>
    </SwitchContext.Provider>
  );
}

// RootProvider (alias for Root)
export function RootProvider(props: SwitchRootProps) {
  return <Root {...props} />;
}

// Label
export interface SwitchLabelProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
}

export function Label({ children, className, ...rest }: SwitchLabelProps) {
  const { disabled } = useSwitchContext();

  return (
    <span
      className={cx(
        "text-sm text-fg-default",
        disabled && "opacity-50",
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

// Control (wrapper for the track + thumb)
export interface SwitchControlProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: ComponentChildren;
}

export function Control({ children, className, ...rest }: SwitchControlProps) {
  const { checked } = useSwitchContext();

  return (
    <span
      className={cx(
        "relative inline-flex w-9 h-5 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-bg-muted",
        className
      )}
      {...rest}
    >
      {children || <Thumb />}
    </span>
  );
}

// Thumb
export interface SwitchThumbProps extends JSX.HTMLAttributes<HTMLSpanElement> {}

export function Thumb({ className, ...rest }: SwitchThumbProps) {
  const { checked } = useSwitchContext();

  return (
    <span
      className={cx(
        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm",
        "transition-transform duration-200",
        checked && "translate-x-4",
        className
      )}
      {...rest}
    />
  );
}

// HiddenInput (for form compatibility)
export interface SwitchHiddenInputProps extends JSX.HTMLAttributes<HTMLInputElement> {
  name?: string;
}

export function HiddenInput(props: SwitchHiddenInputProps) {
  const { checked } = useSwitchContext();
  return <input type="hidden" value={checked ? "on" : "off"} {...props} />;
}

// Indicator (shows different content based on checked state)
export interface SwitchIndicatorProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
  fallback?: ComponentChildren;
}

export function Indicator({ children, fallback, className, ...rest }: SwitchIndicatorProps) {
  const { checked } = useSwitchContext();

  return (
    <span
      className={className}
      data-checked={checked ? "" : undefined}
      {...rest}
    >
      {checked ? children : fallback}
    </span>
  );
}

// ThumbIndicator (indicator inside thumb)
export interface SwitchThumbIndicatorProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
  fallback?: ComponentChildren;
}

export function ThumbIndicator({ children, fallback, className, ...rest }: SwitchThumbIndicatorProps) {
  const { checked } = useSwitchContext();

  return (
    <span
      className={cx(
        "flex items-center justify-center",
        className
      )}
      data-checked={checked ? "" : undefined}
      {...rest}
    >
      {checked ? children : fallback}
    </span>
  );
}

// Export context for advanced use cases
export { SwitchContext as Context };

// Simple Switch component (alias for Root)
export const Switch = Root;
export type SwitchProps = SwitchRootProps;

export type RootProps = SwitchRootProps;
