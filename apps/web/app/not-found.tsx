import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page not-found">
      <span className="eyebrow">ROUTE NOT OBSERVED</span>
      <h1>
        404<span className="gold">_</span>
      </h1>
      <pre>premortem: requested future does not exist</pre>
      <p>The evidence trail ends here. Return to mission control.</p>
      <Link className="button" href="/">
        Back to the Rift
      </Link>
    </div>
  );
}
