'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProviderIcon } from './icons';
import type { ConnectionRecord } from '../_lib/api';

const STORAGE_KEY = 'scp-channel-filter';

/** Read persisted filter from localStorage */
function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

/** Persist filter to localStorage */
function writeStored(value: string | null) {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(STORAGE_KEY, value);
  else localStorage.removeItem(STORAGE_KEY);
}

/**
 * Hook: returns the active connectionId filter (null = all) and a setter.
 * Persists to localStorage so it's sticky across page navigation.
 * Checks URL ?channel= param on first load (deep link from dashboard).
 */
export function useChannelFilter(): [string | null, (id: string | null) => void] {
  const [filter, setFilterState] = useState<string | null>(null);

  // On mount, check URL param first, then localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('channel');
    if (fromUrl) {
      setFilterState(fromUrl);
      writeStored(fromUrl);
    } else {
      const stored = readStored();
      if (stored) setFilterState(stored);
    }
  }, []);

  const setFilter = useCallback((id: string | null) => {
    setFilterState(id);
    writeStored(id);
  }, []);

  return [filter, setFilter];
}

/**
 * Filter bar component — shows connected accounts as pills.
 * "All" is the first option, then each connection.
 */
export function ChannelFilter({
  connections,
  value,
  onChange,
}: {
  connections: ConnectionRecord[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const connected = connections.filter(c => c.status === 'connected');
  if (connected.length <= 1) return null; // no point filtering with 0-1 channels

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => onChange(null)}
        style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
          border: '1px solid var(--border)',
          background: value === null ? 'var(--panel-3)' : 'transparent',
          color: value === null ? 'var(--text)' : 'var(--muted)',
          fontWeight: value === null ? 600 : 400,
        }}>
        All
      </button>
      {connected.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(value === c.id ? null : c.id)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: '1px solid var(--border)',
            background: value === c.id ? 'var(--panel-3)' : 'transparent',
            color: value === c.id ? 'var(--text)' : 'var(--muted)',
            fontWeight: value === c.id ? 600 : 400,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
          <ProviderIcon provider={c.provider} size={14} />
          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.displayName || c.provider}
          </span>
        </button>
      ))}
    </div>
  );
}
