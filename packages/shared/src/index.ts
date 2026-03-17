export type PublishMode = 'draft' | 'direct';

export interface DraftRecord {
  id: string;
  connectionId: string;
  publishMode: PublishMode;
  content: string;
  scheduledFor?: string;
  status: 'draft' | 'queued' | 'published' | 'failed';
}

export interface ProviderAuthAdapter {
  provider: 'linkedin' | 'facebook' | 'instagram' | 'x';
  getAuthorizationUrl(): Promise<string>;
}
