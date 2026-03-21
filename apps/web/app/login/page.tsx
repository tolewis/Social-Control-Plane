'use client';

import { useState, useCallback } from 'react';
import { login } from '../_lib/api';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError('');
    try {
      await login(password);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }, [password, loading]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
    }}>
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        width: '100%',
        maxWidth: 320,
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, textAlign: 'center', margin: 0 }}>
          Social Plane
        </h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            color: 'var(--text)',
            fontSize: '0.95rem',
          }}
        />
        {error && (
          <p style={{ color: 'var(--err)', fontSize: '0.85rem', margin: 0 }}>{error}</p>
        )}
        <button
          type="submit"
          className="btn primary"
          disabled={loading || !password}
          style={{ justifyContent: 'center', width: '100%' }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
