'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchDraft, type DraftRecord } from '../_lib/api';

export function useDraft(id: string | null) {
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDraft(id);
      setDraft(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draft');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { draft, loading, error, refetch: load };
}
