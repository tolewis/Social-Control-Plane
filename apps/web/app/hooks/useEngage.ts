'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchEngageComments,
  fetchEngagePosts,
  fetchEngageStats,
  type EngageCommentRecord,
  type EngagePostRecord,
  type EngageStats,
} from '../_lib/api';

export interface UseEngageCommentsOptions {
  status?: string;
  page?: number;
  pageSize?: number;
}

export function useEngageComments(opts?: UseEngageCommentsOptions) {
  const [comments, setComments] = useState<EngageCommentRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, page, pageSize } = opts ?? {};

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEngageComments({ status, page, pageSize });
      setComments(res.comments);
      setTotal(res.total ?? res.comments.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [status, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  return { comments, total, loading, error, refetch: load };
}

export interface UseEngagePostsOptions {
  commented?: boolean;
  page?: number;
  pageSize?: number;
}

export function useEngagePosts(opts?: UseEngagePostsOptions) {
  const [posts, setPosts] = useState<EngagePostRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { commented, page, pageSize } = opts ?? {};

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEngagePosts({ commented, page, pageSize });
      setPosts(res.posts);
      setTotal(res.total ?? res.posts.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, [commented, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  return { posts, total, loading, error, refetch: load };
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
