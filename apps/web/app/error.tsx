'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page">
      <h1>Observation interrupted.</h1>
      <p>
        A component could not complete its request. No transaction was authorized by this error.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
