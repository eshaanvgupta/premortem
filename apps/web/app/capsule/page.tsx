import { Suspense } from 'react';
import { CapsuleRoute } from '../../components/capsule-route';
export const metadata = { title: 'War Room' };
export default function Page() {
  return (
    <Suspense fallback={<p className="page">Loading capsule…</p>}>
      <CapsuleRoute />
    </Suspense>
  );
}
