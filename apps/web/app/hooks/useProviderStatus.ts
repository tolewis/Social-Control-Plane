'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchProviderStatus, type ProviderId, type ProviderStatusEntry } from '../_lib/api';

export function useProviderStatus() {
  const [providers, setProviders] = useState<Record<ProviderId, ProviderStatusEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchProviderStatus();
      setProviders(res.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { providers, loading, error, refetch: load };
}
