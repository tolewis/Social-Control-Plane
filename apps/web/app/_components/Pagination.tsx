'use client';

/**
 * Shared pagination bar — 25/100 page-size selector + prev/next arrows.
 *
 * Used on Review, Engage, and Queue. Intentionally self-contained with
 * no external state or router coupling — callers pass in page/pageSize/
 * total and handlers, we render the controls and call back.
 *
 * Tim's ask (2026-04-14 evening): "Review, Engage, and Queue should only
 * show the next 25 items, have selectors for 25 and 100, and arrows to
 * go farther."
 */

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Singular noun for the "showing X of Y items" copy. Defaults to "items". */
  label?: string;
  /** Disable all controls (e.g. while loading). */
  disabled?: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 100] as const;

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  label = 'items',
  disabled = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const firstIdx = total === 0 ? 0 : (clamped - 1) * pageSize + 1;
  const lastIdx = Math.min(clamped * pageSize, total);
  const atFirst = clamped <= 1 || disabled;
  const atLast = clamped >= totalPages || disabled;

  return (
    <div className="paginationBar" role="navigation" aria-label="Pagination">
      <div className="paginationCount">
        {total === 0 ? (
          <span className="subtle">No {label}</span>
        ) : (
          <span className="subtle">
            Showing <strong>{firstIdx}</strong>–<strong>{lastIdx}</strong> of{' '}
            <strong>{total.toLocaleString()}</strong> {label}
          </span>
        )}
      </div>

      <div className="paginationControls">
        <label className="paginationSizeLabel">
          Per page
          <select
            className="paginationSizeSelect"
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Items per page"
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <div className="paginationNav">
          <button
            type="button"
            className="btn sm ghost"
            disabled={atFirst}
            onClick={() => onPageChange(clamped - 1)}
            aria-label="Previous page"
            title="Previous page"
          >
            ‹ Prev
          </button>
          <span className="paginationPageLabel">
            Page <strong>{clamped}</strong> of <strong>{totalPages}</strong>
          </span>
          <button
            type="button"
            className="btn sm ghost"
            disabled={atLast}
            onClick={() => onPageChange(clamped + 1)}
            aria-label="Next page"
            title="Next page"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}
