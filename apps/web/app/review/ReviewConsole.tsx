'use client';

import { useMemo, useState } from 'react';
import { StatusPill, type Tone } from '../_components/ui';

type Check = {
  label: string;
  tone: Tone;
  detail: string;
};

type Draft = {
  id: string;
  title: string;
  connection: string;
  provider: 'X' | 'LinkedIn' | 'Facebook' | 'Instagram';
  scheduledAt: string;
  risk: 'low' | 'medium' | 'high';
  copy: string;
  media: Array<{ kind: 'image' | 'video'; label: string }>;
  checks: Check[];
};

const drafts: Draft[] = [
  {
    id: 'd_2191',
    title: 'AI in construction: the boring wins',
    connection: 'Tim / LinkedIn',
    provider: 'LinkedIn',
    scheduledAt: '2026-03-17 14:00',
    risk: 'low',
    copy:
      "Most ‘AI’ wins in construction aren’t flashy.\n\nThey’re boring and operational:\n• tighter submittal cycles\n• fewer RFIs that bounce\n• clearer daily logs\n\nThe tool doesn’t matter. The receipt does.",
    media: [{ kind: 'image', label: 'site-photo-01.jpg' }],
    checks: [
      { label: 'Length', tone: 'ok', detail: '1,012 chars (ok for LinkedIn)' },
      { label: 'Links', tone: 'ok', detail: '1 link · https://tolewis.com/...' },
      { label: 'Compliance', tone: 'ok', detail: 'No disallowed phrases detected' },
    ],
  },
  {
    id: 'd_2190',
    title: 'New product drop (needs rewrite)',
    connection: 'Tackle Room / Facebook',
    provider: 'Facebook',
    scheduledAt: '2026-03-17 10:00',
    risk: 'medium',
    copy:
      "We just dropped a fresh batch of rigs. Grab yours now.\n\n👉 https://thetackleroom.com/products/...\n\n(Operator note: pricing language might be too aggressive)",
    media: [
      { kind: 'image', label: 'product-hero.png' },
      { kind: 'image', label: 'rig-closeup.png' },
    ],
    checks: [
      { label: 'Length', tone: 'ok', detail: '224 chars' },
      { label: 'Links', tone: 'ok', detail: '1 link · thetackleroom.com' },
      { label: 'Tone', tone: 'warn', detail: 'Salesy language flagged (“Grab yours now”)' },
    ],
  },
  {
    id: 'd_2189',
    title: 'Thread draft (token attention)',
    connection: 'Tim / X',
    provider: 'X',
    scheduledAt: '2026-03-17 09:10',
    risk: 'high',
    copy:
      "Hot take: most AI ‘automation’ is just forgetting to read the receipts.\n\nIf you can’t answer what shipped, when, and why — you’re gambling.",
    media: [],
    checks: [
      { label: 'Length', tone: 'ok', detail: '160 chars' },
      { label: 'Links', tone: 'ok', detail: 'No links' },
      { label: 'Connection', tone: 'warn', detail: 'Credential expiry < 24h (may block publish)' },
      { label: 'Sensitivity', tone: 'warn', detail: '“Hot take” framing (review intent)' },
    ],
  },
];

function riskTone(risk: Draft['risk']): Tone {
  if (risk === 'low') return 'ok';
  if (risk === 'medium') return 'warn';
  return 'err';
}

export function ReviewConsole() {
  const [selectedId, setSelectedId] = useState<string>(drafts[0]?.id ?? '');

  const selected = useMemo(() => drafts.find((d) => d.id === selectedId) ?? drafts[0], [selectedId]);

  if (!selected) return null;

  return (
    <div className="split">
      <div className="list" aria-label="Drafts">
        {drafts.map((d) => {
          const active = d.id === selectedId;
          return (
            <div
              key={d.id}
              className={active ? 'listItem active' : 'listItem'}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(d.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelectedId(d.id);
              }}
            >
              <div className="listItemTitle">{d.title}</div>
              <div className="listItemMeta">
                <span className="mono">{d.id}</span>
                <span>•</span>
                <span className="subtle">{d.connection}</span>
              </div>
              <div style={{ marginTop: 10 }} className="chips">
                <StatusPill tone={riskTone(d.risk)}>{d.risk} risk</StatusPill>
                <StatusPill tone="neutral">{d.provider}</StatusPill>
                <StatusPill tone="neutral">{d.scheduledAt}</StatusPill>
              </div>
            </div>
          );
        })}
      </div>

      <div className="preview" aria-label="Draft preview">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="kicker">Preview</div>
            <div style={{ fontWeight: 740, fontSize: '1.06rem', marginTop: 8 }}>{selected.title}</div>
            <div className="subtle" style={{ marginTop: 6 }}>
              {selected.connection} · <span className="mono">{selected.id}</span>
            </div>
          </div>
          <div className="chips">
            <StatusPill tone={riskTone(selected.risk)}>{selected.risk} risk</StatusPill>
            <StatusPill tone="neutral">scheduled</StatusPill>
          </div>
        </div>

        <div style={{ marginTop: 14 }} className="copyBox">
          {selected.copy}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div>
            <div className="kicker">Checks</div>
            <div className="chips" style={{ marginTop: 10 }}>
              {selected.checks.map((c) => (
                <StatusPill key={c.label} tone={c.tone}>
                  {c.label}
                </StatusPill>
              ))}
            </div>
            <div style={{ marginTop: 10 }} className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.checks.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td className="subtle">{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="kicker">Media</div>
            <div style={{ marginTop: 10 }} className="chips">
              {selected.media.length === 0 ? (
                <StatusPill tone="neutral">none</StatusPill>
              ) : (
                selected.media.map((m) => (
                  <StatusPill key={m.label} tone="neutral">
                    {m.kind}: {m.label}
                  </StatusPill>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="kicker">Actions</div>
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary">
                Approve
              </button>
              <button type="button" className="btn">Request changes</button>
              <button type="button" className="btn ghost">Reject</button>
              <button type="button" className="btn ghost">Publish now</button>
            </div>
            <div className="subtle" style={{ marginTop: 10 }}>
              Actions will write receipts: who approved, what changed, what shipped.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
