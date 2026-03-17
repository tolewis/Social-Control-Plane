import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'err' | 'neutral' | 'info';

export function StatusPill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Card({
  title,
  kicker,
  children,
  footer,
  className,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const cls = className ? `card ${className}` : 'card';

  return (
    <section className={cls}>
      <div className="cardHeader">
        <div>
          {kicker ? <div className="kicker">{kicker}</div> : null}
          <div className="cardTitle">{title}</div>
        </div>
      </div>
      <div className="cardBody">{children}</div>
      {footer ? <div className="cardFooter">{footer}</div> : null}
    </section>
  );
}

export function KeyValue({ rows }: { rows: Array<{ k: string; v: ReactNode }> }) {
  return (
    <dl className="kv">
      {rows.map((row) => (
        <div key={row.k} className="kvRow">
          <dt>{row.k}</dt>
          <dd>{row.v}</dd>
        </div>
      ))}
    </dl>
  );
}
