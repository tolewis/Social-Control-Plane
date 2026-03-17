const rows = [
  ['Tackle Room Facebook', 'queued', '2026-03-17 10:00'],
  ['Tim LinkedIn', 'review', '2026-03-17 14:00'],
  ['Tim X', 'direct', 'now'],
];

export default function QueuePage() {
  return (
    <section className="grid">
      <article className="card full">
        <div className="label">Queue</div>
        <table className="table">
          <thead><tr><th>Connection</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.join('-')}><td>{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td></tr>)}
          </tbody>
        </table>
      </article>
    </section>
  );
}
