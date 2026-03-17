export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="kicker">Internal tool first</div>
        <div className="h1">A control plane for agents that post like adults.</div>
        <div className="lead">Drafts, approvals, direct publish, credential health, queue visibility, and receipts. Desktop and mobile first. Modern, calm, and operational instead of clown-car SaaS.</div>
      </section>
      <section className="grid">
        <article className="card">
          <div className="label">Connected channels</div>
          <p className="stat">4</p>
          <div className="subtle">X, LinkedIn, Facebook, Instagram</div>
        </article>
        <article className="card">
          <div className="label">Queue model</div>
          <p className="stat">1 worker/account</p>
          <div className="subtle">Serialized writes. No spammy chaos.</div>
        </article>
        <article className="card">
          <div className="label">Auth direction</div>
          <p className="stat">Postiz-inspired</p>
          <div className="subtle">Provider-specific adapters, cleaner core.</div>
        </article>
        <article className="card wide">
          <div className="label">What this MVP proves</div>
          <div className="chips">
            <span className="chip">Draft for review</span>
            <span className="chip">Direct publish</span>
            <span className="chip">Credential health</span>
            <span className="chip">Idempotent API</span>
            <span className="chip">Per-account queue</span>
            <span className="chip">Responsive UI</span>
          </div>
        </article>
        <article className="card full">
          <div className="label">Current operating stance</div>
          <table className="table">
            <tbody>
              <tr><td>Product mode</td><td>Internal tool first</td></tr>
              <tr><td>Secrets</td><td>Local encrypted first</td></tr>
              <tr><td>Style inspiration</td><td>Contractor-AI structure and polish, not colors</td></tr>
              <tr><td>Publish modes</td><td>Draft + direct publish</td></tr>
            </tbody>
          </table>
        </article>
      </section>
    </>
  );
}
