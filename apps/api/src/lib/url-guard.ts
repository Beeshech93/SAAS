import net from 'net';
import { isProd } from '../config/env';

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./];

/**
 * Validates a user-supplied server URL before the API calls it (SSRF guard).
 * Production: https only, no localhost / private or link-local IP literals.
 * Development and tests may use http and local hosts (a local Evolution container).
 * Returns the origin + path without a trailing slash. Hostnames are not resolved here.
 */
export function assertSafeServerUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.username || url.password) throw new Error('URL must not contain credentials');
  if (isProd) {
    if (url.protocol !== 'https:') throw new Error('URL must use https');
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const bad =
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') ||
      (net.isIPv4(host) && PRIVATE_V4.some((r) => r.test(host))) ||
      (net.isIPv6(host) && (host === '::1' || /^(fc|fd|fe80)/.test(host)));
    if (bad) throw new Error('URL must point to a public server');
  } else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('URL must use http(s)');
  }
  return (url.origin + url.pathname).replace(/\/+$/, '');
}
