import { ComponentChildren, JSX, createContext } from "preact";
import { useState, useContext, useCallback } from "preact/hooks";
import { cx } from "../utils";

// Context for sharing tab state
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs.Root");
  }
  return context;
}

export type TabsSize = "sm" | "md" | "lg";
export type TabsVariant = "line" | "enclosed" | "soft-rounded";

export interface TabsRootProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> {
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  size?: TabsSize;
  variant?: TabsVariant;
  orientation?: "horizontal" | "vertical";
  children: ComponentChildren;
}

export function Root({
  defaultValue = "",
  value: controlledValue,
  onChange,
  size = "md",
  variant = "line",
  orientation = "horizontal",
  children,
  className,
  ...rest
}: TabsRootProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const activeTab = isControlled ? controlledValue : internalValue;

  const setActiveTab = useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    },
    [isControlled, onChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div
        className={cx(
          "flex",
          orientation === "vertical" ? "flex-row" : "flex-col",
          className
        )}
        data-orientation={orientation}
        data-size={size}
        data-variant={variant}
        {...rest}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function List({ children, className, ...rest }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={cx(
        "flex border-b border-gray-200 dark:border-gray-700",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, "value"> {
  value: string;
  disabled?: boolean;
  children: ComponentChildren;
}

export function Trigger({ value, disabled, children, className, ...rest }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cx(
        "px-4 py-2 text-sm font-medium transition-colors duration-150",
        "border-b-2 -mb-px",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isActive
          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
          : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "value"> {
  value: string;
  children: ComponentChildren;
}

export function Content({ value, children, className, ...rest }: TabsContentProps) {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      className={cx("py-4 focus:outline-none", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabsIndicatorProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export function Indicator({ className, ...rest }: TabsIndicatorProps) {
  // This is a placeholder for animated indicator support
  // In a full implementation, this would track and animate to the active tab
  return (
    <div
      className={cx(
        "absolute bottom-0 h-0.5 bg-blue-600 transition-all duration-200",
        className
      )}
      {...rest}
    />
  );
}

// Provider component for advanced use cases
export function RootProvider(props: TabsRootProps) {
  return <Root {...props} />;
}

// Export context for advanced use cases
export { TabsContext as Context };

export type RootProps = TabsRootProps;
