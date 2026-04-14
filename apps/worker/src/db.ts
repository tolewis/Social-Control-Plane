/**
 * Database client for the worker.
 *
 * Defines a DbClient interface that matches the Prisma-generated client shape
 * for the models the worker needs. The factory returns a real PrismaClient
 * at runtime — this indirection lets the code typecheck even when the
 * generated Prisma output isn't present in the local node_modules yet.
 *
 * After `prisma generate`, swap the runtime import below to use @prisma/client
 * directly if you prefer.
 */

// -------------------------------------------------------------------------
// Type-level model shapes (derived from prisma/schema.prisma)
// -------------------------------------------------------------------------

export type PublishJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'RECONCILING'
  | 'CANCELED';

export interface SocialConnectionRow {
  id: string;
  provider: string;
  displayName: string;
  accountRef: string;
  encryptedToken: string;
  encryptedRefresh: string | null;
  scopes: string[];
  expiresAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DraftRow {
  id: string;
  connectionId: string;
  publishMode: string;
  status: string;
  title: string | null;
  content: string;
  mediaJson: unknown;
  scheduledFor: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishJobRow {
  id: string;
  draftId: string;
  connectionId: string;
  status: PublishJobStatus;
  idempotencyKey: string;
  receiptJson: unknown;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaRow {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  createdAt: Date;
}

// -------------------------------------------------------------------------
// Minimal Prisma-compatible delegate interfaces
// -------------------------------------------------------------------------

interface FindUniqueArgs<T> {
  where: { id: string };
}

interface FindManyArgs {
  where: Record<string, unknown>;
}

interface UpdateManyArgs {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}

interface ModelDelegate<T> {
  findUnique(args: FindUniqueArgs<T>): Promise<T | null>;
  findMany(args: FindManyArgs): Promise<T[]>;
  create(args: { data: Record<string, unknown> }): Promise<T>;
  updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<T>;
  delete(args: { where: { id: string } }): Promise<T>;
}

export interface VisualSpecRow {
  id: string;
  draftId: string;
  templateName: string;
  templateData: unknown;
  generatedMediaId: string | null;
  validated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudioBatchRow {
  id: string;
  status: string;
  config: unknown;
  options: unknown;
  results: unknown;
  count: number;
  rendered: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface ProviderConfigRow {
  id: string;
  provider: string;
  encryptedClientId: string;
  encryptedClientSecret: string;
  redirectUri: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EngageCommentRow {
  id: string;
  engagePostId: string;
  connectionId: string;
  commentText: string;
  kbSources: string[];
  slopScore: number;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionNote: string | null;
  receiptJson: unknown;
  fbCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EngagePostRow {
  id: string;
  engagePageId: string;
  fbPostId: string;
  canonicalFbPostId: string | null;
  postUrl: string | null;
  postText: string | null;
  authorName: string | null;
  postedAt: Date | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  discoveredAt: Date;
  commented: boolean;
  skippedReason: string | null;
}

export interface EngagePageRow {
  id: string;
  fbPageId: string;
  platform: string;
  name: string;
  category: string;
  enabled: boolean;
  lastScanned: Date | null;
  realFbPageId: string | null;
  lastPostedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbClient {
  socialConnection: ModelDelegate<SocialConnectionRow>;
  draft: ModelDelegate<DraftRow>;
  publishJob: ModelDelegate<PublishJobRow>;
  media: ModelDelegate<MediaRow>;
  visualSpec: ModelDelegate<VisualSpecRow>;
  studioBatch: ModelDelegate<StudioBatchRow>;
  providerConfig: ModelDelegate<ProviderConfigRow> & {
    findUnique(args: { where: { provider: string } }): Promise<ProviderConfigRow | null>;
  };
  engageComment: ModelDelegate<EngageCommentRow>;
  engagePost: ModelDelegate<EngagePostRow>;
  engagePage: ModelDelegate<EngagePageRow>;
  auditEvent: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  $disconnect(): Promise<void>;
}

// -------------------------------------------------------------------------
// Runtime factory
// -------------------------------------------------------------------------

let instance: DbClient | undefined;

/**
 * Create or return the singleton DB client.
 *
 * At runtime this dynamic-imports @prisma/client so the worker can boot
 * without requiring the generated client to exist at compile time.
 */
export async function getDb(): Promise<DbClient> {
  if (!instance) {
    // Dynamic import so tsc doesn't blow up if the generated client is missing.
    // The module specifier is constructed at runtime to prevent tsc from resolving it.
    const prismaModule = '@prisma/' + 'client';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = await import(/* webpackIgnore: true */ prismaModule) as {
      PrismaClient: new (opts: { log: Array<{ level: string; emit: string }> }) => DbClient;
    };
    const prisma = new PrismaClient({
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    });
    // The real PrismaClient satisfies DbClient at runtime.
    instance = prisma as unknown as DbClient;
  }
  return instance;
}

export async function disconnectDb(): Promise<void> {
  if (instance) {
    await instance.$disconnect();
    instance = undefined;
  }
}
