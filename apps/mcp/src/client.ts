/**
 * Thin HTTP client for the SCP API. Reused by every MCP tool so auth headers,
 * base URL, and error shaping live in one place.
 */

export interface ScpClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class ScpApiError extends Error {
  override name = 'ScpApiError';
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export class ScpClient {
  constructor(private readonly cfg: ScpClientConfig) {}

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      const detail =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as Record<string, unknown>).error)
          : response.statusText;
      throw new ScpApiError(
        `SCP API ${method} ${path} failed (${response.status}): ${detail}`,
        response.status,
        parsed,
      );
    }

    return parsed as T;
  }

  get<T = unknown>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }
  delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

export function loadConfigFromEnv(): ScpClientConfig {
  const baseUrl = process.env.SCP_API_URL;
  const apiKey = process.env.SCP_API_KEY;
  if (!baseUrl) {
    throw new Error(
      'SCP_API_URL is required (e.g. http://localhost:4001 or https://social.teamlewis.co/backend)',
    );
  }
  if (!apiKey) {
    throw new Error(
      'SCP_API_KEY is required. Generate one in the SCP web UI at /settings → API Keys.',
    );
  }
  return { baseUrl, apiKey };
}
