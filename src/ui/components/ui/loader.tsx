import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";
import { Spinner } from "./spinner";

export interface LoaderProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /**
   * Whether the loader is visible
   * @default true
   */
  visible?: boolean;
  /**
   * The spinner to display when loading
   */
  spinner?: ComponentChildren;
  /**
   * The placement of the spinner
   * @default "start"
   */
  spinnerPlacement?: "start" | "end";
  /**
   * The text to display when loading
   */
  text?: ComponentChildren;
  /**
   * Children to wrap/replace when loading
   */
  children?: ComponentChildren;
}

export function Loader({
  spinner = <Spinner size="inherit" borderWidth="0.125em" />,
  spinnerPlacement = "start",
  children,
  text,
  visible = true,
  className,
  ...rest
}: LoaderProps) {
  if (!visible) {
    return <>{children}</>;
  }

  if (text) {
    return (
      <span className={cx("contents", className)} {...rest}>
        {spinnerPlacement === "start" && spinner}
        {text}
        {spinnerPlacement === "end" && spinner}
      </span>
    );
  }

  if (spinner) {
    return (
      <span className={cx("relative inline-flex items-center justify-center", className)} {...rest}>
        <span className="absolute inset-0 flex items-center justify-center">
          {spinner}
        </span>
        <span className="invisible contents">
          {children}
        </span>
      </span>
    );
  }

  return (
    <span className={cx("contents", className)} {...rest}>
      {children}
    </span>
  );
}

export type LoaderProps_Alias = LoaderProps;
