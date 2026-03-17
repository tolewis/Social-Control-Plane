import { Card } from '../_components/ui';
import { ReviewConsole } from './ReviewConsole';

export default function ReviewPage() {
  return (
    <>
      <section>
        <div className="kicker">Approval gate</div>
        <h1 className="pageTitle">Review drafts like an operator.</h1>
        <p className="lead">
          Agents can draft. Humans can approve. This console focuses on copy, media, links, connection readiness, and
          publishing receipts.
        </p>
      </section>

      <section className="section grid">
        <Card title="Drafts" kicker="Inbox" className="full">
          <ReviewConsole />
        </Card>
      </section>
    </>
  );
}
