'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEngageComments, fetchEngageStats, type EngageCommentRecord, type EngageStats } from '../_lib/api';

export function useEngageComments(status?: string) {
  const [comments, setComments] = useState<EngageCommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEngageComments(status, 100);
      setComments(res.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return { comments, loading, error, refetch: load };
}

export function useEngageStats() {
  const [stats, setStats] = useState<EngageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetchEngageStats();
      setStats(res);
    } catch {
      // Stats are non-critical — fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, refetch: load };
}
