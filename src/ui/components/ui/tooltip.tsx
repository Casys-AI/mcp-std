import { ComponentChildren } from "preact";
import { useState, useRef } from "preact/hooks";
import { cx } from "../utils";

export interface TooltipProps {
  content: string | ComponentChildren;
  children: ComponentChildren;
  position?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
  className?: string;
}

const positionClasses = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export function Tooltip({
  content,
  children,
  position = "top",
  disabled,
  className,
}: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={ref}
      className={cx("relative inline-block", className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          role="tooltip"
          className={cx(
            "absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg",
            "dark:bg-gray-100 dark:text-gray-900",
            "whitespace-nowrap pointer-events-none",
            "animate-in fade-in-0 zoom-in-95",
            positionClasses[position]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
