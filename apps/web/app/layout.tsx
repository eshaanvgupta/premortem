import type { Metadata } from 'next';
import '@fontsource/unbounded/700.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import './globals.css';
import { Shell } from '../components/shell';
export const metadata: Metadata = {
  title: { default: 'PREMORTEM — Proof before action', template: '%s | PREMORTEM' },
  description:
    'Agent ID-native adversarial preflight and verifiable decisions on BNB Smart Chain. Let the future fail before it happens.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
