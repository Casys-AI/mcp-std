import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

export interface AbsoluteCenterProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: ComponentChildren;
  display?: "flex" | "inline-flex" | "block" | "inline-block";
  axis?: "horizontal" | "vertical" | "both";
}

export function AbsoluteCenter({
  children,
  display = "flex",
  axis = "both",
  className,
  ...rest
}: AbsoluteCenterProps) {
  const displayClass = display === "inline-flex" ? "inline-flex" : display === "flex" ? "flex" : display === "inline-block" ? "inline-block" : "block";

  return (
    <div
      className={cx(
        "absolute",
        displayClass,
        display === "flex" || display === "inline-flex" ? "items-center justify-center" : "",
        axis === "both" && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        axis === "horizontal" && "left-1/2 -translate-x-1/2",
        axis === "vertical" && "top-1/2 -translate-y-1/2",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export type AbsoluteCenterProps_Alias = AbsoluteCenterProps;
