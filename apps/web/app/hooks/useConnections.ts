'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchConnections, type ConnectionRecord } from '../_lib/api';

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchConnections();
      setConnections(res.connections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { connections, loading, error, refetch: load };
}
