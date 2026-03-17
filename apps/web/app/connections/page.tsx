const connections = [
  ['LinkedIn', 'ready for first vertical slice'],
  ['Facebook', 'shared Meta app strategy'],
  ['Instagram', 'shared Meta app strategy'],
  ['X', 'adapter required'],
];

export default function ConnectionsPage() {
  return (
    <section className="grid">
      <article className="card full">
        <div className="label">Connections</div>
        <table className="table">
          <thead><tr><th>Provider</th><th>Status</th></tr></thead>
          <tbody>
            {connections.map((row) => <tr key={row[0]}><td>{row[0]}</td><td>{row[1]}</td></tr>)}
          </tbody>
        </table>
      </article>
    </section>
  );
}
