'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Activity, Command, ExternalLink, Menu, ShieldCheck, X } from 'lucide-react';
import { usePreferences } from '../lib/state';
import { REGISTRY } from '../lib/config';
const nav = [
  ['/lab', 'Preflight Lab'],
  ['/arena', 'The Arena'],
  ['/recorder', 'Flight Recorder'],
  ['/proof', 'Live Proof'],
];
export function Prism({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? 'prism small' : 'prism'}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path d="M24 3 43 14v20L24 45 5 34V14Z" stroke="currentColor" strokeWidth="3" />
      <path d="m24 11 11 7-4 17-18-7 3-11Z" fill="currentColor" />
      <path d="m5 34 13-9M24 3v18m19 13-19-9" stroke="#0b0e11" strokeWidth="3" />
    </svg>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 20000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [command, setCommand] = useState(false);
  const reduced = usePreferences((s) => s.reduced);
  const toggle = usePreferences((s) => s.toggleReduced);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
      if (e.key === 'Escape') {
        setCommand(false);
        setMenu(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    if (!command) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector('.command-dialog');
    const elements = dialog?.querySelectorAll<HTMLElement>('a[href],button');
    const first = elements?.[0];
    const last = elements?.[elements.length - 1];
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [command]);
  return (
    <QueryClientProvider client={client}>
      <div className={reduced ? 'site reduce' : 'site'}>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <header className="header">
          <Link className="brand" href="/">
            <Prism small />
            <span>
              PREMORTEM<span className="brand-sup">PROTOCOL / 01</span>
            </span>
          </Link>
          <nav className={menu ? 'nav open' : 'nav'} aria-label="Main navigation">
            {nav.map(([href, label]) => (
              <Link
                key={href}
                className={path.startsWith(href) ? 'active' : ''}
                href={href}
                onClick={() => setMenu(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="icon-button command-trigger"
              onClick={() => setCommand(true)}
              aria-label="Open command palette"
            >
              <Command size={17} />
              <kbd>K</kbd>
            </button>
            <Link className="button compact outline" href="/me">
              My Proof
            </Link>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? 'Close menu' : 'Open menu'}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </header>
        <div className="network-strip">
          <span>
            <Activity size={13} /> BNB SMART CHAIN <b>56</b>
          </span>
          <span>
            {REGISTRY ? 'READING DEPLOYED REGISTRY' : 'PREDEPLOYMENT · REGISTRY NOT CONFIGURED'}
          </span>
          <span className="strip-note">ZERO CUSTODY. PROOF BEFORE ACTION.</span>
        </div>
        <main id="main">{children}</main>
        <footer>
          <div className="footer-top">
            <Link className="brand" href="/">
              <Prism small />
              PREMORTEM
            </Link>
            <p>Let the future fail before it happens.</p>
            <span className="mono">BUILT FOR CONSEQUENCES.</span>
          </div>
          <div className="footer-links">
            <Link href="/security">How it works / Security</Link>
            <Link href="/developers">Developers</Link>
            <Link href="/submission">Judges / Submission</Link>
            <a
              href="https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction"
              target="_blank"
              rel="noreferrer"
            >
              Official wallet docs <ExternalLink size={12} />
            </a>
            <button onClick={toggle} aria-pressed={reduced}>
              Motion: {reduced ? 'reduced' : 'system'}
            </button>
          </div>
          <p className="fine">
            <ShieldCheck size={14} /> Community review is advisory. RPC simulation and consensus do
            not guarantee security. No affiliation or endorsement is implied.
          </p>
        </footer>
        {command && (
          <div className="dialog-backdrop" onClick={() => setCommand(false)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              className="command-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="eyebrow">
                MISSION CONTROL{' '}
                <button
                  autoFocus
                  className="icon-button"
                  onClick={() => setCommand(false)}
                  aria-label="Close command palette"
                >
                  <X />
                </button>
              </div>
              <h2>Where next?</h2>
              {[
                ...nav,
                ['/me', 'My Proof'],
                ['/security', 'Security'],
                ['/developers', 'Developer tools'],
              ].map(([href, label]) => (
                <Link href={href} key={href} onClick={() => setCommand(false)}>
                  {label}
                  <span>OPEN</span>
                </Link>
              ))}
            </section>
          </div>
        )}
      </div>
    </QueryClientProvider>
  );
}
