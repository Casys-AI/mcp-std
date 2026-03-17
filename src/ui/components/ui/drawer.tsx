import { ComponentChildren, JSX, createContext } from "preact";
import { useState, useContext, useCallback, useEffect, useRef } from "preact/hooks";
import { cx } from "../utils";

// Drawer Context
interface DrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  placement: "left" | "right" | "top" | "bottom";
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext() {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error("Drawer components must be used within a Drawer.Root");
  }
  return context;
}

// Root
export interface DrawerRootProps {
  children: ComponentChildren;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: "left" | "right" | "top" | "bottom";
  unmountOnExit?: boolean;
  lazyMount?: boolean;
}

export function Root({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = "right",
}: DrawerRootProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange]
  );

  return (
    <DrawerContext.Provider value={{ open, setOpen, placement }}>
      {children}
    </DrawerContext.Provider>
  );
}

// RootProvider (alias for Root)
export function RootProvider(props: DrawerRootProps) {
  return <Root {...props} />;
}

// Trigger
export interface DrawerTriggerProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  asChild?: boolean;
}

export function Trigger({ children, className, asChild, ...rest }: DrawerTriggerProps) {
  const { setOpen } = useDrawerContext();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}

// Backdrop
export interface DrawerBackdropProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export function Backdrop({ className, ...rest }: DrawerBackdropProps) {
  const { open, setOpen } = useDrawerContext();

  if (!open) return null;

  return (
    <div
      className={cx(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        "animate-in fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className
      )}
      onClick={() => setOpen(false)}
      aria-hidden="true"
      {...rest}
    />
  );
}

// Positioner
export interface DrawerPositionerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Positioner({ children, className, ...rest }: DrawerPositionerProps) {
  const { open, placement } = useDrawerContext();

  if (!open) return null;

  const positionClasses = {
    left: "inset-y-0 left-0",
    right: "inset-y-0 right-0",
    top: "inset-x-0 top-0",
    bottom: "inset-x-0 bottom-0",
  };

  return (
    <div
      className={cx(
        "fixed z-50",
        positionClasses[placement],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// Content
export interface DrawerContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Content({ children, className, ...rest }: DrawerContentProps) {
  const { open, setOpen, placement } = useDrawerContext();
  const contentRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, setOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      contentRef.current?.focus();
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [open]);

  if (!open) return null;

  const sizeClasses = {
    left: "h-full w-80 max-w-[90vw]",
    right: "h-full w-80 max-w-[90vw]",
    top: "w-full h-64 max-h-[90vh]",
    bottom: "w-full h-64 max-h-[90vh]",
  };

  const animationClasses = {
    left: "animate-in slide-in-from-left",
    right: "animate-in slide-in-from-right",
    top: "animate-in slide-in-from-top",
    bottom: "animate-in slide-in-from-bottom",
  };

  return (
    <div
      ref={contentRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={cx(
        "bg-white dark:bg-gray-900 shadow-xl",
        "flex flex-col overflow-auto",
        "focus:outline-none",
        sizeClasses[placement],
        animationClasses[placement],
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...rest}
    >
      {children}
    </div>
  );
}

// Header
export interface DrawerHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Header({ children, className, ...rest }: DrawerHeaderProps) {
  return (
    <div
      className={cx(
        "flex flex-col gap-1.5 p-6 pb-0",
        "border-b border-gray-200 dark:border-gray-700",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// Title
export interface DrawerTitleProps extends JSX.HTMLAttributes<HTMLHeadingElement> {
  children: ComponentChildren;
}

export function Title({ children, className, ...rest }: DrawerTitleProps) {
  return (
    <h2
      className={cx(
        "text-lg font-semibold text-gray-900 dark:text-white",
        className
      )}
      {...rest}
    >
      {children}
    </h2>
  );
}

// Description
export interface DrawerDescriptionProps extends JSX.HTMLAttributes<HTMLParagraphElement> {
  children: ComponentChildren;
}

export function Description({ children, className, ...rest }: DrawerDescriptionProps) {
  return (
    <p
      className={cx(
        "text-sm text-gray-600 dark:text-gray-400",
        className
      )}
      {...rest}
    >
      {children}
    </p>
  );
}

// Body
export interface DrawerBodyProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Body({ children, className, ...rest }: DrawerBodyProps) {
  return (
    <div
      className={cx("flex-1 p-6 overflow-auto", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

// Footer
export interface DrawerFooterProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Footer({ children, className, ...rest }: DrawerFooterProps) {
  return (
    <div
      className={cx(
        "flex items-center justify-end gap-3 p-6",
        "border-t border-gray-200 dark:border-gray-700",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// CloseTrigger
export interface DrawerCloseTriggerProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children?: ComponentChildren;
  asChild?: boolean;
}

export function CloseTrigger({ children, className, asChild, ...rest }: DrawerCloseTriggerProps) {
  const { setOpen } = useDrawerContext();

  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className={cx(
        "absolute top-4 right-4 p-1 rounded-md",
        "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
        "hover:bg-gray-100 dark:hover:bg-gray-800",
        "focus:outline-none focus:ring-2 focus:ring-blue-500",
        "transition-colors",
        className
      )}
      aria-label="Close"
      {...rest}
    >
      {children || (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>Close</title>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      )}
    </button>
  );
}

// Export context for advanced use cases
export { DrawerContext as Context };

export type RootProps = DrawerRootProps;
