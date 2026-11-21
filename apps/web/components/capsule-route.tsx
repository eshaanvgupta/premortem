'use client';
import { useSearchParams } from 'next/navigation';
import { WarRoom } from './war-room';
import { Notice } from './ui';
export function CapsuleRoute() {
  const id = useSearchParams().get('id') ?? '';
  if (!/^[1-9]\d{0,76}$/.test(id))
    return (
      <div className="page">
        <Notice tone="error">Open a valid capsule from the Arena.</Notice>
      </div>
    );
  return <WarRoom key={id} id={id} />;
}
