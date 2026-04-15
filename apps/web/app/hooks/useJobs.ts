'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchJobs, type PublishJobRecord } from '../_lib/api';

export interface UseJobsOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  connectionId?: string;
}

export function useJobs(opts?: UseJobsOptions) {
  const [jobs, setJobs] = useState<PublishJobRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { page, pageSize, status, connectionId } = opts ?? {};

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJobs({ page, pageSize, status, connectionId });
      setJobs(res.jobs);
      setTotal(res.total ?? res.jobs.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, connectionId]);

  useEffect(() => { load(); }, [load]);

  return { jobs, total, loading, error, refetch: load };
}
