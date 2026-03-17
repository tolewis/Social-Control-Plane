import { Card, StatusPill } from '../_components/ui';

type QueueStatus = 'queued' | 'running' | 'blocked' | 'failed' | 'needs review';

type QueueItem = {
  id: string;
  connection: string;
  provider: 'X' | 'LinkedIn' | 'Facebook' | 'Instagram';
  mode: 'direct' | 'review' | 'scheduled';
  status: QueueStatus;
  runAt: string;
  attempts: number;
  payload: string;
  lastError?: string;
};

const items: QueueItem[] = [
  {
    id: 'q_10421',
    connection: 'Tim / X',
    provider: 'X',
    mode: 'direct',
    status: 'running',
    runAt: 'now',
    attempts: 0,
    payload: 'Post · 274 chars · 0 media',
  },
  {
    id: 'q_10420',
    connection: 'Tackle Room / Facebook',
    provider: 'Facebook',
    mode: 'scheduled',
    status: 'queued',
    runAt: '2026-03-17 10:00',
    attempts: 1,
    payload: 'Post · 1 image · link preview',
  },
  {
    id: 'q_10419',
    connection: 'Tim / LinkedIn',
    provider: 'LinkedIn',
    mode: 'review',
    status: 'needs review',
    runAt: '2026-03-17 14:00',
    attempts: 0,
    payload: 'Draft · 1 attachment · CTA link',
  },
  {
    id: 'q_10418',
    connection: 'Tim / X',
    provider: 'X',
    mode: 'scheduled',
    status: 'blocked',
    runAt: '2026-03-17 09:10',
    attempts: 0,
    payload: 'Post · 1 image',
    lastError: 'Credential check pending (token expiry < 24h)',
  },
  {
    id: 'q_10417',
    connection: 'Tackle Room / Instagram',
    provider: 'Instagram',
    mode: 'scheduled',
    status: 'failed',
    runAt: '2026-03-16 18:30',
    attempts: 3,
    payload: 'Post · 2 images · caption',
    lastError: 'Meta Graph: rate limit. Backoff exhausted.',
  },
];

function pillForStatus(status: QueueStatus) {
  switch (status) {
    case 'queued':
      return <StatusPill tone="neutral">queued</StatusPill>;
    case 'running':
      return <StatusPill tone="info">running</StatusPill>;
    case 'blocked':
      return <StatusPill tone="warn">blocked</StatusPill>;
    case 'failed':
      return <StatusPill tone="err">failed</StatusPill>;
    case 'needs review':
      return <StatusPill tone="warn">needs review</StatusPill>;
  }
}

export default function QueuePage() {
  return (
    <>
      <section>
        <div className="kicker">Queue inspector</div>
        <h1 className="pageTitle">See what will publish, before it does.</h1>
        <p className="lead">
          This view exists so operators can answer: “What’s scheduled?”, “What’s stuck?”, and “What did we retry?”
          without tailing logs.
        </p>
      </section>

      <section className="section grid">
        <Card title="Filters" kicker="Slice" className="full">
          <div className="chips">
            <button type="button" className="chip active">All</button>
            <button type="button" className="chip">Queued</button>
            <button type="button" className="chip">Running</button>
            <button type="button" className="chip">Needs review</button>
            <button type="button" className="chip">Blocked</button>
            <button type="button" className="chip">Failed</button>
          </div>
          <div style={{ marginTop: 10 }} className="subtle">
            Planned: per-account lanes, backoff visibility, and “why blocked” explanations.
          </div>
        </Card>

        <Card title="Active lane" kicker="Tim" className="full">
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Queue ID</th>
                  <th>Connection</th>
                  <th>Provider</th>
                  <th>Mode</th>
                  <th>Run at</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Payload</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{i.id}</td>
                    <td>{i.connection}</td>
                    <td className="subtle">{i.provider}</td>
                    <td className="subtle">{i.mode}</td>
                    <td className="mono">{i.runAt}</td>
                    <td>{pillForStatus(i.status)}</td>
                    <td className="mono">{i.attempts}</td>
                    <td className="subtle">{i.payload}</td>
                    <td className="subtle">{i.lastError ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </>
  );
}
