import { ComponentChildren, JSX, createContext } from "preact";
import { useState, useContext, useCallback, useMemo } from "preact/hooks";
import { cx } from "../utils";

// Pagination Context
interface PaginationContextValue {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  pages: Array<{ type: "page"; value: number } | { type: "ellipsis" }>;
  isFirstPage: boolean;
  isLastPage: boolean;
}

const PaginationContext = createContext<PaginationContextValue | null>(null);

function usePaginationContext() {
  const context = useContext(PaginationContext);
  if (!context) {
    throw new Error("Pagination components must be used within a Pagination.Root");
  }
  return context;
}

// Helper to generate page range with ellipsis
function generatePages(
  currentPage: number,
  totalPages: number,
  siblingCount: number = 1
): Array<{ type: "page"; value: number } | { type: "ellipsis" }> {
  const pages: Array<{ type: "page"; value: number } | { type: "ellipsis" }> = [];

  // Always show first page
  pages.push({ type: "page", value: 1 });

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 2);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages - 1);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - 1;

  if (showLeftEllipsis) {
    pages.push({ type: "ellipsis" });
  } else {
    for (let i = 2; i < leftSiblingIndex; i++) {
      pages.push({ type: "page", value: i });
    }
  }

  for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
    if (i > 1 && i < totalPages) {
      pages.push({ type: "page", value: i });
    }
  }

  if (showRightEllipsis) {
    pages.push({ type: "ellipsis" });
  } else {
    for (let i = rightSiblingIndex + 1; i < totalPages; i++) {
      pages.push({ type: "page", value: i });
    }
  }

  // Always show last page if more than 1 page
  if (totalPages > 1) {
    pages.push({ type: "page", value: totalPages });
  }

  return pages;
}

// Root
export interface PaginationRootProps extends Omit<JSX.HTMLAttributes<HTMLElement>, "onChange"> {
  children: ComponentChildren;
  page?: number;
  defaultPage?: number;
  count: number;
  pageSize?: number;
  siblingCount?: number;
  onChange?: (page: number) => void;
}

export function Root({
  children,
  page: controlledPage,
  defaultPage = 1,
  count,
  pageSize = 10,
  siblingCount = 1,
  onChange,
  className,
  ...rest
}: PaginationRootProps) {
  const [internalPage, setInternalPage] = useState(defaultPage);
  const isControlled = controlledPage !== undefined;
  const page = isControlled ? controlledPage : internalPage;

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const setPage = useCallback(
    (newPage: number) => {
      const clampedPage = Math.max(1, Math.min(newPage, totalPages));
      if (!isControlled) {
        setInternalPage(clampedPage);
      }
      onChange?.(clampedPage);
    },
    [isControlled, onChange, totalPages]
  );

  const pages = useMemo(
    () => generatePages(page, totalPages, siblingCount),
    [page, totalPages, siblingCount]
  );

  return (
    <PaginationContext.Provider
      value={{
        page,
        totalPages,
        setPage,
        pages,
        isFirstPage: page === 1,
        isLastPage: page === totalPages,
      }}
    >
      <nav
        role="navigation"
        aria-label="Pagination"
        className={cx("flex items-center gap-1", className)}
        {...rest}
      >
        {children}
      </nav>
    </PaginationContext.Provider>
  );
}

// RootProvider (alias for Root)
export function RootProvider(props: PaginationRootProps) {
  return <Root {...props} />;
}

// PrevTrigger
export interface PaginationPrevTriggerProps {
  children?: ComponentChildren;
  disabled?: boolean;
  className?: string;
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  [key: string]: unknown;
}

export function PrevTrigger({ children, className, disabled, ...rest }: PaginationPrevTriggerProps) {
  const { page, setPage, isFirstPage } = usePaginationContext();
  const isDisabled = disabled || isFirstPage;

  return (
    <button
      type="button"
      onClick={() => setPage(page - 1)}
      disabled={isDisabled}
      aria-label="Previous page"
      className={cx(
        "inline-flex items-center justify-center w-9 h-9 rounded-md",
        "text-gray-700 dark:text-gray-300",
        "hover:bg-gray-100 dark:hover:bg-gray-800",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        "transition-colors",
        className
      )}
      {...rest}
    >
      {children || (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <title>Previous</title>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      )}
    </button>
  );
}

// NextTrigger
export interface PaginationNextTriggerProps {
  children?: ComponentChildren;
  disabled?: boolean;
  className?: string;
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  [key: string]: unknown;
}

export function NextTrigger({ children, className, disabled, ...rest }: PaginationNextTriggerProps) {
  const { page, setPage, isLastPage } = usePaginationContext();
  const isDisabled = disabled || isLastPage;

  return (
    <button
      type="button"
      onClick={() => setPage(page + 1)}
      disabled={isDisabled}
      aria-label="Next page"
      className={cx(
        "inline-flex items-center justify-center w-9 h-9 rounded-md",
        "text-gray-700 dark:text-gray-300",
        "hover:bg-gray-100 dark:hover:bg-gray-800",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        "transition-colors",
        className
      )}
      {...rest}
    >
      {children || (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <title>Next</title>
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </button>
  );
}

// Item (page number button)
export interface PaginationItemProps {
  children?: ComponentChildren;
  value?: number;
  pageType?: "page";
  asChild?: boolean;
  className?: string;
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  [key: string]: unknown;
}

export function Item({ children, value, className, asChild, ...rest }: PaginationItemProps) {
  const { page, setPage } = usePaginationContext();
  const isSelected = value !== undefined && page === value;

  return (
    <button
      type="button"
      onClick={() => value !== undefined && setPage(value)}
      aria-current={isSelected ? "page" : undefined}
      className={cx(
        "inline-flex items-center justify-center min-w-[36px] h-9 px-3 rounded-md",
        "text-sm font-medium",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        "transition-colors",
        isSelected
          ? "bg-blue-600 text-white"
          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
        className
      )}
      {...rest}
    >
      {children || value}
    </button>
  );
}

// Ellipsis
export interface PaginationEllipsisProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: ComponentChildren;
  index?: number;
  asChild?: boolean;
}

export function Ellipsis({ children, className, index, asChild, ...rest }: PaginationEllipsisProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center w-9 h-9 text-gray-500 dark:text-gray-400",
        className
      )}
      aria-hidden="true"
      {...rest}
    >
      {children || (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <title>More pages</title>
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </svg>
      )}
    </span>
  );
}

// Items helper component
export interface PaginationItemsProps {
  render: (page: { type: "page"; value: number; selected: boolean }) => ComponentChildren;
  ellipsis?: ComponentChildren;
  className?: string;
}

export function Items({ render, ellipsis, className }: PaginationItemsProps) {
  const { page, pages } = usePaginationContext();

  return (
    <>
      {pages.map((pageItem, index) => {
        if (pageItem.type === "ellipsis") {
          return (
            <Ellipsis key={`ellipsis-${index}`} index={index} className={className}>
              {ellipsis}
            </Ellipsis>
          );
        }

        return (
          <Item key={pageItem.value} value={pageItem.value} className={className}>
            {render({ ...pageItem, selected: page === pageItem.value })}
          </Item>
        );
      })}
    </>
  );
}

// Export context for advanced use cases
export { PaginationContext as Context };

export type RootProps = PaginationRootProps;
