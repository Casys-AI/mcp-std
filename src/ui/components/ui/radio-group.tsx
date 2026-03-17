import { ComponentChildren, JSX, createContext } from "preact";
import { useState, useContext, useCallback } from "preact/hooks";
import { cx } from "../utils";

// RadioGroup Context
interface RadioGroupContextValue {
  value: string;
  onChange: (value: string) => void;
  name: string;
  disabled: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

function useRadioGroupContext() {
  const context = useContext(RadioGroupContext);
  if (!context) {
    throw new Error("RadioGroup components must be used within a RadioGroup.Root");
  }
  return context;
}

// Root
export interface RadioGroupRootProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> {
  children: ComponentChildren;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
}

export function Root({
  children,
  value: controlledValue,
  defaultValue = "",
  onChange,
  name,
  disabled = false,
  orientation = "vertical",
  size = "md",
  className,
  ...rest
}: RadioGroupRootProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    },
    [isControlled, onChange]
  );

  const groupName = name || `radio-group-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <RadioGroupContext.Provider value={{ value, onChange: handleChange, name: groupName, disabled }}>
      <div
        role="radiogroup"
        aria-orientation={orientation}
        className={cx(
          "flex",
          orientation === "vertical" ? "flex-col gap-2" : "flex-row gap-4 flex-wrap",
          className
        )}
        data-orientation={orientation}
        data-size={size}
        {...rest}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

// RootProvider (alias for Root)
export function RootProvider(props: RadioGroupRootProps) {
  return <Root {...props} />;
}

// Item
export interface RadioGroupItemProps extends Omit<JSX.HTMLAttributes<HTMLLabelElement>, "value"> {
  children?: ComponentChildren;
  value: string;
  disabled?: boolean;
}

const itemSizeStyles = {
  sm: { radio: "w-4 h-4", dot: "w-1.5 h-1.5", label: "text-sm" },
  md: { radio: "w-5 h-5", dot: "w-2 h-2", label: "text-sm" },
  lg: { radio: "w-6 h-6", dot: "w-2.5 h-2.5", label: "text-base" },
};

export function Item({ children, value, disabled: itemDisabled, className, ...rest }: RadioGroupItemProps) {
  const { value: selectedValue, onChange, name, disabled: groupDisabled } = useRadioGroupContext();
  const isSelected = selectedValue === value;
  const disabled = itemDisabled || groupDisabled;

  const handleChange = () => {
    if (!disabled) {
      onChange(value);
    }
  };

  return (
    <label
      className={cx(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      {...rest}
    >
      <ItemControl value={value} disabled={disabled} />
      {children && <ItemText>{children}</ItemText>}
    </label>
  );
}

// ItemControl (the radio circle)
export interface RadioGroupItemControlProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  value?: string;
  disabled?: boolean;
}

export function ItemControl({ value, disabled: itemDisabled, className, ...rest }: RadioGroupItemControlProps) {
  const { value: selectedValue, onChange, name, disabled: groupDisabled } = useRadioGroupContext();
  const isSelected = value !== undefined && selectedValue === value;
  const disabled = itemDisabled || groupDisabled;

  return (
    <span className="relative inline-flex items-center justify-center">
      <input
        type="radio"
        name={name}
        value={value}
        checked={isSelected}
        disabled={disabled}
        onChange={() => value && !disabled && onChange(value)}
        className="sr-only peer"
      />
      <span
        className={cx(
          "w-5 h-5 rounded-full border-2 transition-colors duration-150",
          "flex items-center justify-center",
          isSelected
            ? "border-blue-600 bg-blue-600"
            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800",
          !disabled && "hover:border-blue-500",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2",
          className
        )}
        {...rest}
      >
        {isSelected && (
          <span className="w-2 h-2 rounded-full bg-white" />
        )}
      </span>
    </span>
  );
}

// ItemText
export interface RadioGroupItemTextProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
}

export function ItemText({ children, className, ...rest }: RadioGroupItemTextProps) {
  return (
    <span
      className={cx("text-sm text-gray-900 dark:text-white", className)}
      {...rest}
    >
      {children}
    </span>
  );
}

// Label (group label)
export interface RadioGroupLabelProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
}

export function Label({ children, className, ...rest }: RadioGroupLabelProps) {
  return (
    <span
      className={cx(
        "text-sm font-medium text-gray-900 dark:text-white mb-2",
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

// Indicator (visual indicator within the radio)
export interface RadioGroupIndicatorProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: ComponentChildren;
}

export function Indicator({ children, className, ...rest }: RadioGroupIndicatorProps) {
  return (
    <span
      className={cx("w-2 h-2 rounded-full bg-white", className)}
      {...rest}
    >
      {children}
    </span>
  );
}

// ItemHiddenInput (for form compatibility)
export interface RadioGroupItemHiddenInputProps extends JSX.HTMLAttributes<HTMLInputElement> {
  value?: string;
}

export function ItemHiddenInput({ value, ...props }: RadioGroupItemHiddenInputProps) {
  const { name, value: selectedValue } = useRadioGroupContext();
  return (
    <input
      type="radio"
      name={name}
      value={value}
      checked={selectedValue === value}
      readOnly
      className="sr-only"
      {...props}
    />
  );
}

// Export context for advanced use cases
export { RadioGroupContext as Context };

export type RootProps = RadioGroupRootProps;
export type ItemProps = RadioGroupItemProps;
