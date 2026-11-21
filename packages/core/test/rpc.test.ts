import { describe, it, expect } from 'vitest';
import { logRpcUrls } from '../src/client';
describe('event log provider selection', () => {
  it('excludes documented dataseed hosts from defaults', () =>
    expect(logRpcUrls()).toEqual([
      'https://bsc-rpc.publicnode.com',
      'https://rpc-bnb.blockmachine.io',
    ]));
  it('rejects an exclusively disabled provider list', () =>
    expect(() => logRpcUrls(['https://bsc-dataseed-public.bnbchain.org'])).toThrow('log-capable'));
  it('excludes numbered and legacy dataseed aliases', () =>
    expect(
      logRpcUrls([
        'https://bsc-dataseed1.bnbchain.org',
        'https://bsc-dataseed.binance.org',
        'http://127.0.0.1:18547',
      ]),
    ).toEqual(['http://127.0.0.1:18547']));
  it('preserves custom authenticated provider order without logging credentials', () =>
    expect(
      logRpcUrls(['https://example.com/bsc?key=local-test-only', 'https://bsc-rpc.publicnode.com']),
    ).toHaveLength(2));
  it('rejects missing providers', () => expect(() => logRpcUrls([])).toThrow('log-capable'));
});
