import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { LinkedInAdapter, FacebookAdapter, InstagramAdapter, XAdapter } from '@scp/providers';
import type { DraftRecord } from '@scp/shared';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const drafts = new Map<string, DraftRecord>();

app.get('/health', async () => ({ ok: true, service: 'api' }));

app.get('/auth/urls', async () => {
  return {
    linkedin: await new LinkedInAdapter().getAuthorizationUrl().catch(() => 'missing-config'),
    facebook: await new FacebookAdapter().getAuthorizationUrl().catch(() => 'missing-config'),
    instagram: await new InstagramAdapter().getAuthorizationUrl().catch(() => 'missing-config'),
    x: await new XAdapter().getAuthorizationUrl().catch(() => 'missing-config'),
  };
});

app.get('/drafts', async () => ({ drafts: Array.from(drafts.values()) }));

app.post('/drafts', async (request, reply) => {
  const body = z.object({
    connectionId: z.string(),
    publishMode: z.enum(['draft', 'direct']),
    content: z.string().min(1),
    scheduledFor: z.string().optional(),
  }).parse(request.body);

  const draft: DraftRecord = {
    id: crypto.randomUUID(),
    connectionId: body.connectionId,
    publishMode: body.publishMode,
    content: body.content,
    scheduledFor: body.scheduledFor,
    status: body.publishMode === 'draft' ? 'draft' : 'queued',
  };
  drafts.set(draft.id, draft);
  reply.code(201);
  return { draft };
});

app.post('/publish/:draftId', async (request, reply) => {
  const params = z.object({ draftId: z.string() }).parse(request.params);
  const draft = drafts.get(params.draftId);
  if (!draft) return reply.code(404).send({ error: 'draft_not_found' });
  draft.status = 'queued';
  drafts.set(draft.id, draft);
  return { queued: true, draft };
});

const port = Number(process.env.APP_PORT || 4001);
app.listen({ port, host: '0.0.0.0' });
