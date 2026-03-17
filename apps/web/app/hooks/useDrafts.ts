'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchDrafts, type DraftRecord } from '../_lib/api';

export function useDrafts() {
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDrafts();
      setDrafts(res.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { drafts, loading, error, refetch: load };
}
