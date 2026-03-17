export default function ReviewPage() {
  return (
    <section className="grid">
      <article className="card wide">
        <div className="label">Review copy</div>
        <p className="lead">Agents can create drafts for review. UI handles copy review, media inspection, approval, rejection, and rescheduling.</p>
      </article>
      <article className="card">
        <div className="label">Actions</div>
        <div className="chips">
          <span className="chip">Approve</span>
          <span className="chip">Reject</span>
          <span className="chip">Reschedule</span>
          <span className="chip">Publish now</span>
        </div>
      </article>
    </section>
  );
}
