'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchJobs, type PublishJobRecord } from '../_lib/api';

export function useJobs() {
  const [jobs, setJobs] = useState<PublishJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJobs();
      setJobs(res.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { jobs, loading, error, refetch: load };
}
