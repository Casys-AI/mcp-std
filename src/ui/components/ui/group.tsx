import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

export interface GroupProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
  gap?: "none" | "xs" | "sm" | "md" | "lg" | "xl";
  direction?: "row" | "column";
  wrap?: boolean;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  grow?: boolean;
  attached?: "horizontal" | "vertical";
}

const gapStyles = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

const alignStyles = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const justifyStyles = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

export function Group({
  children,
  gap = "sm",
  direction = "row",
  wrap = false,
  align = "center",
  justify = "start",
  grow,
  attached,
  className,
  ...rest
}: GroupProps) {
  return (
    <div
      className={cx(
        "flex",
        direction === "column" ? "flex-col" : "flex-row",
        wrap && "flex-wrap",
        grow && "flex-grow",
        attached ? "gap-0" : gapStyles[gap],
        alignStyles[align],
        justifyStyles[justify],
        attached === "horizontal" && "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none [&>*:not(:first-child)]:-ml-px",
        attached === "vertical" && "[&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none [&>*:not(:first-child)]:-mt-px",
        className
      )}
      data-attached={attached}
      {...rest}
    >
      {children}
    </div>
  );
}
