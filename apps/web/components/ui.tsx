'use client';
import { useState } from 'react';
import { Copy, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { explorer, short, json } from '../lib/config';
export function Hash({ value, kind = 'address' }: { value: string; kind?: 'address' | 'tx' }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="hash">
      <a title={value} href={explorer(value, kind)} target="_blank" rel="noreferrer">
        {short(value)}
        <ExternalLink size={12} />
      </a>
      <button
        aria-label={`Copy ${kind}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}
export function Notice({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'error';
}) {
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'note'}>
      <AlertTriangle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-cross">+</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Raw({
  value,
  label = 'Reproducible raw JSON',
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <details className="raw">
      <summary>{label}</summary>
      <pre>{json(value)}</pre>
    </details>
  );
}
export function PageIntro({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-intro">
      <div className="eyebrow">
        <span className="accent-line" />
        {kicker}
      </div>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
