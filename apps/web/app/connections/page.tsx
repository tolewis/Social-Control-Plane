import { Card, StatusPill } from '../_components/ui';

type ConnStatus = 'healthy' | 'attention' | 'down';

type Connection = {
  id: string;
  provider: 'LinkedIn' | 'Facebook' | 'Instagram' | 'X';
  account: string;
  status: ConnStatus;
  lastVerified: string;
  token: string;
  scopes: string;
  note?: string;
};

const connections: Connection[] = [
  {
    id: 'conn_001',
    provider: 'LinkedIn',
    account: 'Tim',
    status: 'healthy',
    lastVerified: '2m ago',
    token: 'expires in 31d',
    scopes: 'w_member_social, r_liteprofile',
  },
  {
    id: 'conn_002',
    provider: 'Facebook',
    account: 'Tackle Room',
    status: 'healthy',
    lastVerified: '6m ago',
    token: 'expires in 59d',
    scopes: 'pages_manage_posts, pages_read_engagement',
  },
  {
    id: 'conn_003',
    provider: 'Instagram',
    account: 'Tackle Room',
    status: 'attention',
    lastVerified: '6m ago',
    token: 'expires in 18h',
    scopes: 'instagram_basic, instagram_content_publish',
    note: 'Token refresh needed soon; queue may block to avoid surprise failures.',
  },
  {
    id: 'conn_004',
    provider: 'X',
    account: 'Tim',
    status: 'down',
    lastVerified: '—',
    token: 'not configured',
    scopes: '—',
    note: 'Adapter not wired yet. Keep visible so “missing capability” is explicit.',
  },
];

function pillForStatus(status: ConnStatus) {
  if (status === 'healthy') return <StatusPill tone="ok">healthy</StatusPill>;
  if (status === 'attention') return <StatusPill tone="warn">attention</StatusPill>;
  return <StatusPill tone="err">down</StatusPill>;
}

export default function ConnectionsPage() {
  return (
    <>
      <section>
        <div className="kicker">Credential health</div>
        <h1 className="pageTitle">Connections should not fail silently.</h1>
        <p className="lead">
          Providers are fickle. Tokens expire. Scopes drift. This page makes connection health visible and actionable.
        </p>
      </section>

      <section className="section grid">
        <Card title="Summary" kicker="Signals">
          <div className="chips">
            <StatusPill tone="ok">3 healthy</StatusPill>
            <StatusPill tone="warn">1 attention</StatusPill>
            <StatusPill tone="err">1 down</StatusPill>
            <StatusPill tone="neutral">last check 2m ago</StatusPill>
          </div>
          <div className="subtle" style={{ marginTop: 12 }}>
            Planned: background health checks, expiry alerts, and “block publish when unsafe” policies.
          </div>
        </Card>

        <Card title="Policy" kicker="Operational" className="wide">
          <div className="subtle">
            The operator console should explain failures in plain language:
            <ul style={{ marginTop: 10, paddingLeft: 18 }}>
              <li>what broke (token/scopes/provider)</li>
              <li>impact (blocked lane / delayed schedule / partial publish)</li>
              <li>next step (reauth / refresh / adapter work)</li>
            </ul>
          </div>
        </Card>

        <Card title="Connections" kicker="Inventory" className="full">
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Status</th>
                  <th>Last verified</th>
                  <th>Token</th>
                  <th>Scopes</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 680 }}>{c.provider}</div>
                      <div className="subtle">{c.account}</div>
                      <div className="mono subtle">{c.id}</div>
                    </td>
                    <td>{pillForStatus(c.status)}</td>
                    <td className="mono">{c.lastVerified}</td>
                    <td className="mono subtle">{c.token}</td>
                    <td className="mono subtle">{c.scopes}</td>
                    <td className="subtle">{c.note ?? '—'}</td>
                    <td>
                      {c.status === 'healthy' ? (
                        <button type="button" className="btn ghost">Re-check</button>
                      ) : c.status === 'attention' ? (
                        <button type="button" className="btn primary">Refresh token</button>
                      ) : (
                        <button type="button" className="btn primary">Connect</button>
                      )}
                    </td>
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
