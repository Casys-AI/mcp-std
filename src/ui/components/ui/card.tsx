import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700",
        "shadow-sm overflow-hidden",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function CardHeader({ children, className, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cx("px-6 py-4 border-b border-gray-200 dark:border-gray-700", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardBodyProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function CardBody({ children, className, ...rest }: CardBodyProps) {
  return (
    <div className={cx("px-6 py-4", className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function CardFooter({ children, className, ...rest }: CardFooterProps) {
  return (
    <div
      className={cx(
        "px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardTitleProps extends JSX.HTMLAttributes<HTMLHeadingElement> {
  children: ComponentChildren;
}

export function CardTitle({ children, className, ...rest }: CardTitleProps) {
  return (
    <h3
      className={cx("text-lg font-semibold text-gray-900 dark:text-white", className)}
      {...rest}
    >
      {children}
    </h3>
  );
}

export interface CardDescriptionProps extends JSX.HTMLAttributes<HTMLParagraphElement> {
  children: ComponentChildren;
}

export function CardDescription({ children, className, ...rest }: CardDescriptionProps) {
  return (
    <p className={cx("text-sm text-gray-500 dark:text-gray-400 mt-1", className)} {...rest}>
      {children}
    </p>
  );
}

// Named exports matching old API
export const Root = Card;
export const Header = CardHeader;
export const Body = CardBody;
export const Footer = CardFooter;
export const Title = CardTitle;
export const Description = CardDescription;

export type RootProps = CardProps;
