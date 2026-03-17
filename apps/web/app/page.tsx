import { Card, KeyValue, StatusPill } from './_components/ui';

const nextRuns = [
  {
    connection: 'Tim / X',
    item: 'Direct publish',
    runAt: 'now',
    status: 'running' as const,
  },
  {
    connection: 'Tackle Room / Facebook',
    item: 'Scheduled post',
    runAt: '10:00',
    status: 'queued' as const,
  },
  {
    connection: 'Tim / LinkedIn',
    item: 'Draft awaiting review',
    runAt: '14:00',
    status: 'needs review' as const,
  },
];

const receipts = [
  {
    id: 'rcpt_0192',
    connection: 'Tim / LinkedIn',
    mode: 'review',
    outcome: 'ok' as const,
    at: '2m ago',
    details: 'Published · 1 attachment · 0 retries',
  },
  {
    id: 'rcpt_0191',
    connection: 'Tackle Room / Facebook',
    mode: 'scheduled',
    outcome: 'ok' as const,
    at: '48m ago',
    details: 'Published · idempotent hit avoided',
  },
  {
    id: 'rcpt_0190',
    connection: 'Tim / X',
    mode: 'direct',
    outcome: 'warn' as const,
    at: '3h ago',
    details: 'Rate-limit softened · retried once',
  },
];

function pillForRunStatus(status: (typeof nextRuns)[number]['status']) {
  if (status === 'running') return <StatusPill tone="info">running</StatusPill>;
  if (status === 'queued') return <StatusPill tone="neutral">queued</StatusPill>;
  return <StatusPill tone="warn">needs review</StatusPill>;
}

export default function OverviewPage() {
  return (
    <>
      <section>
        <div className="kicker">Operational snapshot</div>
        <h1 className="pageTitle">Publishing, without surprises.</h1>
        <p className="lead">
          A calm control plane for agent-generated posts: draft review, direct publish, queue inspection, connection
          health, and receipts.
        </p>
      </section>

      <section className="section grid">
        <Card
          title="Queue health"
          kicker="Execution"
          className="wide"
          footer={
            <div className="subtle">
              Principle: serialized writes per account. Queue is the truth; receipts are the evidence.
            </div>
          }
        >
          <div className="chips" style={{ marginBottom: 12 }}>
            <StatusPill tone="neutral">12 queued</StatusPill>
            <StatusPill tone="info">1 running</StatusPill>
            <StatusPill tone="ok">0 failed</StatusPill>
            <StatusPill tone="warn">3 need review</StatusPill>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Item</th>
                  <th>Run at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {nextRuns.map((r) => (
                  <tr key={`${r.connection}-${r.runAt}`}>
                    <td>{r.connection}</td>
                    <td className="subtle">{r.item}</td>
                    <td className="mono">{r.runAt}</td>
                    <td>{pillForRunStatus(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Review backlog" kicker="Approvals">
          <KeyValue
            rows={[
              { k: 'Waiting', v: <StatusPill tone="warn">3 drafts</StatusPill> },
              { k: 'Oldest', v: <span className="mono">1h 12m</span> },
              { k: 'SLA', v: <span className="subtle">Operator-defined</span> },
            ]}
          />
          <div style={{ marginTop: 12 }} className="subtle">
            Review is a safety gate: copy, media, links, and destination compliance.
          </div>
        </Card>

        <Card title="Connection health" kicker="Credentials">
          <KeyValue
            rows={[
              {
                k: 'Healthy',
                v: (
                  <span>
                    <StatusPill tone="ok">3</StatusPill> <span className="subtle">providers</span>
                  </span>
                ),
              },
              { k: 'Attention', v: <StatusPill tone="warn">1</StatusPill> },
              { k: 'Last check', v: <span className="mono">2m ago</span> },
            ]}
          />
          <div style={{ marginTop: 12 }} className="subtle">
            Credentials degrade silently. The console should not.
          </div>
        </Card>

        <Card title="Recent receipts" kicker="Evidence" className="full">
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Connection</th>
                  <th>Mode</th>
                  <th>Outcome</th>
                  <th>When</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.connection}</td>
                    <td className="subtle">{r.mode}</td>
                    <td>
                      {r.outcome === 'ok' ? (
                        <StatusPill tone="ok">ok</StatusPill>
                      ) : (
                        <StatusPill tone="warn">warn</StatusPill>
                      )}
                    </td>
                    <td className="mono">{r.at}</td>
                    <td className="subtle">{r.details}</td>
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
