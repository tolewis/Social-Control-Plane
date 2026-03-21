'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { exchangeToken } from '../../../_lib/api';
import { StatusPill } from '../../../_components/ui';
import type { ProviderId } from '../../../_lib/api';

const VALID_PROVIDERS = new Set(['linkedin', 'facebook', 'instagram', 'x']);

function broadcastSuccess(provider: string) {
  try {
    const bc = new BroadcastChannel('scp-oauth');
    bc.postMessage({ type: 'oauth-success', provider });
    bc.close();
  } catch {
    // BroadcastChannel not supported — parent tab will refetch on focus
  }
}

export default function OAuthCallbackPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [message, setMessage] = useState('Completing authorization...');

  useEffect(() => {
    const provider = params.provider as string;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || `Provider denied access: ${error}`);
      return;
    }

    if (!VALID_PROVIDERS.has(provider)) {
      setStatus('error');
      setMessage(`Unknown provider: ${provider}`);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing code or state parameter from OAuth redirect.');
      return;
    }

    exchangeToken(provider as ProviderId, code, state)
      .then(() => {
        setStatus('success');
        setMessage('Connected! This tab will close automatically.');
        broadcastSuccess(provider);
        // Try to close the tab (works if opened via window.open)
        setTimeout(() => {
          window.close();
          // If close didn't work (direct navigation), redirect instead
          setMessage('Connected! Redirecting...');
          setTimeout(() => router.push('/connections'), 1000);
        }, 800);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Token exchange failed');
      });
  }, [params.provider, searchParams, router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      textAlign: 'center',
    }}>
      <div>
        {status === 'exchanging' && (
          <p style={{ fontSize: '1.05rem' }}>Completing authorization...</p>
        )}
        {status === 'success' && (
          <>
            <StatusPill tone="ok">Connected</StatusPill>
            <p style={{ marginTop: 12, fontSize: '1.05rem' }}>{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <StatusPill tone="err">Error</StatusPill>
            <p style={{ marginTop: 12, fontSize: '0.95rem', color: 'var(--muted)' }}>{message}</p>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                window.close();
                router.push('/connections');
              }}
              style={{ marginTop: 16 }}
            >
              Back to Connections
            </button>
          </>
        )}
      </div>
    </div>
  );
}
