import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Shell } from '../components/shell';
const display = localFont({
  src: '../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2',
  weight: '700',
  display: 'swap',
  variable: '--font-display',
});
const text = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2',
      weight: '400',
    },
    {
      path: '../node_modules/@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff2',
      weight: '500',
    },
    {
      path: '../node_modules/@fontsource/instrument-sans/files/instrument-sans-latin-700-normal.woff2',
      weight: '700',
    },
  ],
  display: 'swap',
  variable: '--font-text',
});
const mono = localFont({
  src: '../node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-mono',
});
export const metadata: Metadata = {
  title: { default: 'PREMORTEM — Proof before action', template: '%s | PREMORTEM' },
  description:
    'Agent ID-native adversarial preflight and verifiable decisions on BNB Smart Chain. Let the future fail before it happens.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${text.variable} ${mono.variable}`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
