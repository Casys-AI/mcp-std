import { ComponentChildren } from "preact";
import { cx } from "../utils";

export type AlertStatus = "info" | "success" | "warning" | "error";

export interface AlertProps {
  status?: AlertStatus;
  title?: string;
  children?: ComponentChildren;
  className?: string;
}

const statusStyles: Record<AlertStatus, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200",
  success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-200",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-200",
  error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200",
};

const icons: Record<AlertStatus, string> = {
  info: "i",
  success: "\u2713",
  warning: "\u26A0",
  error: "\u2717",
};

export function Alert({ status = "info", title, children, className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cx(
        "flex gap-3 p-4 border rounded-lg",
        statusStyles[status],
        className
      )}
    >
      <span className="flex-shrink-0 text-lg font-bold">{icons[status]}</span>
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-sm">{children}</div>}
      </div>
    </div>
  );
}

export function AlertTitle({ children, className }: { children: ComponentChildren; className?: string }) {
  return <div className={cx("font-semibold", className)}>{children}</div>;
}

export function AlertDescription({ children, className }: { children: ComponentChildren; className?: string }) {
  return <div className={cx("text-sm", className)}>{children}</div>;
}
