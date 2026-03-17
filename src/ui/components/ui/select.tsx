import { ComponentChildren, JSX, createContext } from "preact";
import { useState, useContext, useCallback, useEffect, useRef } from "preact/hooks";
import { cx } from "../utils";

// Select Context
interface SelectItem {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string[];
  onSelect: (value: string) => void;
  multiple: boolean;
  disabled: boolean;
  items: SelectItem[];
  registerItem: (item: SelectItem) => void;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error("Select components must be used within a Select.Root");
  }
  return context;
}

// Item Context (for individual items)
interface SelectItemContextValue {
  value: string;
  selected: boolean;
  disabled: boolean;
  highlighted: boolean;
}

const SelectItemContext = createContext<SelectItemContextValue | null>(null);

function useSelectItemContext() {
  const context = useContext(SelectItemContext);
  if (!context) {
    throw new Error("Select.Item components must be used within a Select.Item");
  }
  return context;
}

// Root
export interface SelectRootProps<T = string> {
  children: ComponentChildren;
  value?: T[];
  defaultValue?: T[];
  onValueChange?: (value: T[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  name?: string;
  size?: "sm" | "md" | "lg";
}

export function Root<T extends string>({
  children,
  value: controlledValue,
  defaultValue = [],
  onValueChange,
  multiple = false,
  disabled = false,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  name,
  size = "md",
}: SelectRootProps<T>) {
  const [internalValue, setInternalValue] = useState<string[]>(defaultValue as string[]);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [items, setItems] = useState<SelectItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const isValueControlled = controlledValue !== undefined;
  const isOpenControlled = controlledOpen !== undefined;

  const value = (isValueControlled ? controlledValue : internalValue) as string[];
  const open = isOpenControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (newOpen: boolean) => {
      if (!isOpenControlled) {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
      if (!newOpen) {
        setHighlightedIndex(-1);
      }
    },
    [isOpenControlled, onOpenChange]
  );

  const onSelect = useCallback(
    (selectedValue: string) => {
      let newValue: string[];
      if (multiple) {
        if (value.includes(selectedValue)) {
          newValue = value.filter((v) => v !== selectedValue);
        } else {
          newValue = [...value, selectedValue];
        }
      } else {
        newValue = [selectedValue];
        setOpen(false);
      }

      if (!isValueControlled) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue as T[]);
    },
    [multiple, value, isValueControlled, onValueChange, setOpen]
  );

  const registerItem = useCallback((item: SelectItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.value === item.value)) {
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  return (
    <SelectContext.Provider
      value={{
        open,
        setOpen,
        value,
        onSelect,
        multiple,
        disabled,
        items,
        registerItem,
        highlightedIndex,
        setHighlightedIndex,
      }}
    >
      <div className="relative inline-block" data-size={size}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

// Label
export interface SelectLabelProps extends JSX.HTMLAttributes<HTMLLabelElement> {
  children: ComponentChildren;
}

export function Label({ children, className, ...rest }: SelectLabelProps) {
  return (
    <label
      className={cx(
        "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1",
        className
      )}
      {...rest}
    >
      {children}
    </label>
  );
}

// Control
export interface SelectControlProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Control({ children, className, ...rest }: SelectControlProps) {
  return (
    <div className={cx("relative", className)} {...rest}>
      {children}
    </div>
  );
}

// Trigger
export interface SelectTriggerProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children?: ComponentChildren;
}

export function Trigger({ children, className, ...rest }: SelectTriggerProps) {
  const { open, setOpen, disabled, value, items } = useSelectContext();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (!disabled) {
      setOpen(!open);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(!open);
    } else if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cx(
        "inline-flex items-center justify-between w-full px-3 py-2",
        "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md",
        "text-sm text-gray-900 dark:text-white",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-colors",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ValueText
export interface SelectValueTextProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  placeholder?: string;
}

export function ValueText({ placeholder = "Select...", className, ...rest }: SelectValueTextProps) {
  const { value, items } = useSelectContext();

  const displayText = value.length > 0
    ? value
        .map((v) => items.find((item) => item.value === v)?.label || v)
        .join(", ")
    : placeholder;

  return (
    <span
      className={cx(
        "truncate",
        value.length === 0 && "text-gray-500 dark:text-gray-400",
        className
      )}
      {...rest}
    >
      {displayText}
    </span>
  );
}

// Indicator (chevron icon)
export interface SelectIndicatorProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: ComponentChildren;
}

export function Indicator({ children, className, ...rest }: SelectIndicatorProps) {
  const { open } = useSelectContext();

  return (
    <span
      className={cx(
        "flex-shrink-0 ml-2 transition-transform duration-200",
        open && "rotate-180",
        className
      )}
      {...rest}
    >
      {children || (
        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <title>Toggle</title>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </span>
  );
}

// IndicatorGroup (container for indicators)
export interface SelectIndicatorGroupProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function IndicatorGroup({ children, className, ...rest }: SelectIndicatorGroupProps) {
  return (
    <div className={cx("flex items-center gap-1", className)} {...rest}>
      {children}
    </div>
  );
}

// Positioner
export interface SelectPositionerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Positioner({ children, className, ...rest }: SelectPositionerProps) {
  const { open } = useSelectContext();

  if (!open) return null;

  return (
    <div
      className={cx(
        "absolute z-50 w-full mt-1",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// Content
export interface SelectContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Content({ children, className, ...rest }: SelectContentProps) {
  const { open, setOpen } = useSelectContext();
  const contentRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    // Delay to prevent immediate close
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [open, setOpen]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={contentRef}
      role="listbox"
      className={cx(
        "py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
        "rounded-md shadow-lg max-h-60 overflow-auto",
        "animate-in fade-in-0 zoom-in-95",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// List (alias for Content)
export const List = Content;

// ItemGroup
export interface SelectItemGroupProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function ItemGroup({ children, className, ...rest }: SelectItemGroupProps) {
  return (
    <div role="group" className={cx("py-1", className)} {...rest}>
      {children}
    </div>
  );
}

// ItemGroupLabel
export interface SelectItemGroupLabelProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function ItemGroupLabel({ children, className, ...rest }: SelectItemGroupLabelProps) {
  return (
    <div
      className={cx(
        "px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// Item
export interface SelectItemProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "value"> {
  children: ComponentChildren;
  value: string;
  disabled?: boolean;
}

export function Item({ children, value, disabled = false, className, onClick, ...rest }: SelectItemProps) {
  const { value: selectedValues, onSelect, registerItem, highlightedIndex, items, setHighlightedIndex } = useSelectContext();
  const isSelected = selectedValues.includes(value);
  const itemIndex = items.findIndex((i) => i.value === value);
  const isHighlighted = highlightedIndex === itemIndex;

  // Register item on mount
  useEffect(() => {
    const label = typeof children === "string" ? children : value;
    registerItem({ value, label, disabled });
  }, [value, children, disabled, registerItem]);

  const handleClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (!disabled) {
      onSelect(value);
      onClick?.(e);
    }
  };

  const handleMouseEnter = () => {
    if (!disabled) {
      setHighlightedIndex(itemIndex);
    }
  };

  return (
    <SelectItemContext.Provider value={{ value, selected: isSelected, disabled, highlighted: isHighlighted }}>
      <div
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled}
        data-highlighted={isHighlighted || undefined}
        data-selected={isSelected || undefined}
        data-disabled={disabled || undefined}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        className={cx(
          "flex items-center justify-between px-3 py-2 cursor-pointer",
          "text-sm text-gray-900 dark:text-white",
          "transition-colors",
          isHighlighted && "bg-gray-100 dark:bg-gray-700",
          isSelected && "bg-blue-50 dark:bg-blue-900/20",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && !isHighlighted && "hover:bg-gray-100 dark:hover:bg-gray-700",
          className
        )}
        {...rest}
      >
        {children}
      </div>
    </SelectItemContext.Provider>
  );
}

// ItemText
export interface SelectItemTextProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
}

export function ItemText({ children, className, ...rest }: SelectItemTextProps) {
  return (
    <span className={cx("truncate", className)} {...rest}>
      {children}
    </span>
  );
}

// ItemIndicator
export interface SelectItemIndicatorProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: ComponentChildren;
}

export function ItemIndicator({ children, className, ...rest }: SelectItemIndicatorProps) {
  const { selected } = useSelectItemContext();

  if (!selected) {
    return <span className="w-4" aria-hidden="true" />;
  }

  return (
    <span className={cx("flex-shrink-0 text-blue-600 dark:text-blue-400", className)} {...rest}>
      {children || (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <title>Selected</title>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

// ClearTrigger
export interface SelectClearTriggerProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children?: ComponentChildren;
}

export function ClearTrigger({ children, className, onClick, ...rest }: SelectClearTriggerProps) {
  const { value, onSelect, disabled } = useSelectContext();

  if (value.length === 0) return null;

  const handleClick = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!disabled) {
      // Clear all values
      value.forEach((v) => onSelect(v));
    }
    onClick?.(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cx(
        "p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600",
        "focus:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      aria-label="Clear selection"
      {...rest}
    >
      {children || (
        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <title>Clear</title>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      )}
    </button>
  );
}

// HiddenSelect (for form compatibility)
export interface SelectHiddenSelectProps extends JSX.HTMLAttributes<HTMLSelectElement> {
  name?: string;
}

export function HiddenSelect({ name, ...props }: SelectHiddenSelectProps) {
  const { value, multiple, items } = useSelectContext();

  // Note: value type differs between single/multiple mode
  const selectValue = multiple ? value : (value[0] || "");

  return (
    <select
      name={name}
      multiple={multiple}
      value={selectValue as string}
      onChange={() => {}} // No-op since this is a hidden select for form submission
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      {...props}
    >
      <option value="">Select...</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

// Export contexts
export { SelectContext as Context, SelectItemContext as ItemContext };

// Export value change details type
export interface ValueChangeDetails<T = string> {
  value: T[];
}

export type RootProps<T = string> = SelectRootProps<T>;
