'use client';

import { useEffect } from 'react';
import { StatusPill } from '../_components/ui';
import { useProviderStatus } from '../hooks/useProviderStatus';
import { PROVIDER_ORDER } from '../_lib/providerMeta';
import { ProviderSetupCard } from './ProviderSetupCard';

interface IntegrationsTabProps {
  highlightProvider?: string | null;
}

export function IntegrationsTab({ highlightProvider }: IntegrationsTabProps) {
  const { providers, loading, error, refetch } = useProviderStatus();

  // Listen for OAuth completions from the callback tab
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('scp-oauth');
      bc.onmessage = () => { refetch(); };
      return () => bc.close();
    } catch {
      const onFocus = () => refetch();
      window.addEventListener('focus', onFocus);
      return () => window.removeEventListener('focus', onFocus);
    }
  }, [refetch]);

  // Scroll to highlighted provider on mount
  useEffect(() => {
    if (highlightProvider) {
      const el = document.getElementById(`provider-${highlightProvider}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightProvider, loading]);

  return (
    <div>
      <h2 className="sectionTitle">Integrations</h2>
      <p className="subtle" style={{ marginBottom: 16, fontSize: '0.88rem' }}>
        Set up each provider by entering your developer credentials, then connect your account. X and LinkedIn use an OAuth popup. Facebook and Instagram use the Meta token flow from the Connections page.
      </p>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <StatusPill tone="err">{error}</StatusPill>
        </div>
      )}

      {loading ? (
        <p className="subtle">Loading...</p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {PROVIDER_ORDER.map((provider) => (
            <ProviderSetupCard
              key={provider}
              provider={provider}
              entry={providers?.[provider]}
              onRefetch={refetch}
              highlighted={highlightProvider === provider}
            />
          ))}
        </div>
      )}
    </div>
  );
}
