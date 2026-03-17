import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

// Root Table component
export interface TableRootProps extends JSX.HTMLAttributes<HTMLTableElement> {
  children: ComponentChildren;
  size?: "sm" | "md" | "lg";
  variant?: "line" | "outline";
  striped?: boolean;
  highlightOnHover?: boolean;
  stickyHeader?: boolean;
}

const sizeStyles = {
  sm: "[&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 text-xs",
  md: "[&_th]:px-4 [&_th]:py-3 [&_td]:px-4 [&_td]:py-3 text-sm",
  lg: "[&_th]:px-6 [&_th]:py-4 [&_td]:px-6 [&_td]:py-4 text-base",
};

export function Root({
  children,
  size = "md",
  variant = "line",
  striped,
  highlightOnHover,
  stickyHeader,
  className,
  ...rest
}: TableRootProps) {
  return (
    <table
      className={cx(
        "w-full border-collapse",
        sizeStyles[size],
        variant === "outline" && "border border-gray-200 dark:border-gray-700",
        striped && "[&_tbody_tr:nth-child(even)]:bg-gray-50 dark:[&_tbody_tr:nth-child(even)]:bg-gray-800/50",
        highlightOnHover && "[&_tbody_tr]:hover:bg-gray-100 dark:[&_tbody_tr]:hover:bg-gray-800",
        stickyHeader && "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10",
        className
      )}
      {...rest}
    >
      {children}
    </table>
  );
}

// Table Head
export interface TableHeadProps extends JSX.HTMLAttributes<HTMLTableSectionElement> {
  children: ComponentChildren;
}

export function Head({ children, className, ...rest }: TableHeadProps) {
  return (
    <thead
      className={cx(
        "bg-gray-50 dark:bg-gray-800/80",
        className
      )}
      {...rest}
    >
      {children}
    </thead>
  );
}

// Table Body
export interface TableBodyProps extends JSX.HTMLAttributes<HTMLTableSectionElement> {
  children: ComponentChildren;
}

export function Body({ children, className, ...rest }: TableBodyProps) {
  return (
    <tbody
      className={cx(
        "divide-y divide-gray-200 dark:divide-gray-700",
        className
      )}
      {...rest}
    >
      {children}
    </tbody>
  );
}

// Table Row
export interface TableRowProps extends JSX.HTMLAttributes<HTMLTableRowElement> {
  children: ComponentChildren;
  selected?: boolean;
}

export function Row({ children, selected, className, ...rest }: TableRowProps) {
  return (
    <tr
      className={cx(
        "transition-colors duration-150",
        selected && "bg-blue-50 dark:bg-blue-900/20",
        className
      )}
      data-selected={selected || undefined}
      {...rest}
    >
      {children}
    </tr>
  );
}

// Table Header Cell
export interface TableHeaderProps extends JSX.HTMLAttributes<HTMLTableCellElement> {
  children?: ComponentChildren;
  sortable?: boolean;
  sorted?: "asc" | "desc" | false;
}

export function Header({
  children,
  sortable,
  sorted,
  className,
  onClick,
  ...rest
}: TableHeaderProps) {
  return (
    <th
      className={cx(
        "text-left font-semibold text-gray-700 dark:text-gray-200",
        "border-b border-gray-200 dark:border-gray-700",
        sortable && "cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700",
        className
      )}
      onClick={onClick}
      {...rest}
    >
      <div className="flex items-center gap-1">
        {children}
        {sorted && (
          <svg
            className={cx(
              "w-4 h-4 transition-transform",
              sorted === "desc" && "rotate-180"
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <title>{sorted === "asc" ? "Sorted ascending" : "Sorted descending"}</title>
            <path d="M8 14l4-4 4 4" />
          </svg>
        )}
      </div>
    </th>
  );
}

// Table Cell
export interface TableCellProps extends JSX.HTMLAttributes<HTMLTableCellElement> {
  children?: ComponentChildren;
  numeric?: boolean;
}

export function Cell({ children, numeric, className, ...rest }: TableCellProps) {
  return (
    <td
      className={cx(
        "text-gray-700 dark:text-gray-300",
        "border-b border-gray-200 dark:border-gray-700",
        numeric && "text-right tabular-nums",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

// Table Footer
export interface TableFootProps extends JSX.HTMLAttributes<HTMLTableSectionElement> {
  children: ComponentChildren;
}

export function Foot({ children, className, ...rest }: TableFootProps) {
  return (
    <tfoot
      className={cx(
        "bg-gray-50 dark:bg-gray-800/80 font-medium",
        className
      )}
      {...rest}
    >
      {children}
    </tfoot>
  );
}

// Table Caption
export interface TableCaptionProps extends JSX.HTMLAttributes<HTMLTableCaptionElement> {
  children: ComponentChildren;
  placement?: "top" | "bottom";
}

export function Caption({ children, placement = "bottom", className, ...rest }: TableCaptionProps) {
  return (
    <caption
      className={cx(
        "text-sm text-gray-500 dark:text-gray-400",
        placement === "top" ? "caption-top mb-2" : "caption-bottom mt-2",
        className
      )}
      {...rest}
    >
      {children}
    </caption>
  );
}

// Export types
export type RootProps = TableRootProps;
