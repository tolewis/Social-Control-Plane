'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchDrafts, type DraftRecord } from '../_lib/api';

export interface UseDraftsOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  connectionId?: string;
}

/**
 * Load drafts with optional server-side pagination.
 *
 * Backward compat: calling with no args returns ALL drafts (legacy behavior
 * — unpaginated). Pass `page` to opt into the paginated response; the hook
 * then exposes `total` alongside the rows so callers can render a
 * Pagination control.
 */
export function useDrafts(opts?: UseDraftsOptions) {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { page, pageSize, status, connectionId } = opts ?? {};

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDrafts({ page, pageSize, status, connectionId });
      setDrafts(res.drafts);
      setTotal(res.total ?? res.drafts.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, connectionId]);

  useEffect(() => { load(); }, [load]);

  return { drafts, total, loading, error, refetch: load };
}
