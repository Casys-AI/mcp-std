import { ComponentChildren, JSX, createContext } from "preact";
import { useState, useContext, useCallback, useEffect, useRef } from "preact/hooks";
import { cx } from "../utils";

// Dialog Context
interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within a Dialog.Root");
  }
  return context;
}

// Root
export interface DialogRootProps {
  children: ComponentChildren;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  unmountOnExit?: boolean;
  lazyMount?: boolean;
}

export function Root({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
}: DialogRootProps) {
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
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

// RootProvider (alias for Root)
export function RootProvider(props: DialogRootProps) {
  return <Root {...props} />;
}

// Trigger
export interface DialogTriggerProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  asChild?: boolean;
}

export function Trigger({ children, className, asChild, ...rest }: DialogTriggerProps) {
  const { setOpen } = useDialogContext();

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
export interface DialogBackdropProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export function Backdrop({ className, ...rest }: DialogBackdropProps) {
  const { open, setOpen } = useDialogContext();

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
export interface DialogPositionerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Positioner({ children, className, ...rest }: DialogPositionerProps) {
  const { open } = useDialogContext();

  if (!open) return null;

  return (
    <div
      className={cx(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// Content
export interface DialogContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Content({ children, className, ...rest }: DialogContentProps) {
  const { open, setOpen } = useDialogContext();
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

  // Trap focus and prevent body scroll when open
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

  return (
    <div
      ref={contentRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={cx(
        "relative bg-white dark:bg-gray-900 rounded-lg shadow-xl",
        "max-h-[85vh] w-full max-w-lg overflow-auto",
        "animate-in fade-in-0 zoom-in-95",
        "focus:outline-none",
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
export interface DialogHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Header({ children, className, ...rest }: DialogHeaderProps) {
  return (
    <div
      className={cx(
        "flex flex-col gap-1.5 p-6 pb-0",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// Title
export interface DialogTitleProps extends JSX.HTMLAttributes<HTMLHeadingElement> {
  children: ComponentChildren;
}

export function Title({ children, className, ...rest }: DialogTitleProps) {
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
export interface DialogDescriptionProps extends JSX.HTMLAttributes<HTMLParagraphElement> {
  children: ComponentChildren;
}

export function Description({ children, className, ...rest }: DialogDescriptionProps) {
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
export interface DialogBodyProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Body({ children, className, ...rest }: DialogBodyProps) {
  return (
    <div
      className={cx("p-6", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

// Footer
export interface DialogFooterProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Footer({ children, className, ...rest }: DialogFooterProps) {
  return (
    <div
      className={cx(
        "flex items-center justify-end gap-3 p-6 pt-0",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// CloseTrigger
export interface DialogCloseTriggerProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children?: ComponentChildren;
  asChild?: boolean;
}

export function CloseTrigger({ children, className, asChild, ...rest }: DialogCloseTriggerProps) {
  const { setOpen } = useDialogContext();

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

// ActionTrigger (closes dialog when clicked)
export interface DialogActionTriggerProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
}

export function ActionTrigger({ children, onClick, className, ...rest }: DialogActionTriggerProps) {
  const { setOpen } = useDialogContext();

  const handleClick = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    setOpen(false);
    onClick?.(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}

// Export context for advanced use cases
export { DialogContext as Context };

export type RootProps = DialogRootProps;
