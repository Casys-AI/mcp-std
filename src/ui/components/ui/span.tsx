import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

export interface SpanProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: ComponentChildren;
  display?: "inline" | "inline-block" | "block" | "contents" | "none";
  visibility?: "visible" | "hidden";
}

const displayStyles: Record<string, string> = {
  inline: "inline",
  "inline-block": "inline-block",
  block: "block",
  contents: "contents",
  none: "hidden",
};

const visibilityStyles: Record<string, string> = {
  visible: "visible",
  hidden: "invisible",
};

export function Span({
  children,
  display,
  visibility,
  className,
  ...rest
}: SpanProps) {
  return (
    <span
      className={cx(
        display && displayStyles[display],
        visibility && visibilityStyles[visibility],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export type SpanProps_Alias = SpanProps;
