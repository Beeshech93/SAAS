export interface ExtractedLeadData {
  emails: string[];
  primaryEmail: string | null;
  phone: string | null;
  socialLinks: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    twitter?: string;
    whatsapp?: string;
  };
}

const COMMON_CONTACT_SUBPATHS = [
  '/contact',
  '/contacto',
  '/contact-us',
  '/contactenos',
  '/about',
  '/nosotros',
  '/sobre-nosotros',
  '/aviso-legal',
];

const IGNORED_DOMAINS = [
  'sentry.io',
  'example.com',
  'domain.com',
  'wixpress.com',
  'cloudflare.com',
  'google.com',
  'googleapis.com',
  'schema.org',
  'w3.org',
  'wordpress.org',
  'github.com',
  'gravatar.com',
];

const IGNORED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.css',
  '.js',
  '.pdf',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
];

const PRIORITY_PREFIXES = [
  'info@',
  'contacto@',
  'contact@',
  'hola@',
  'hello@',
  'ventas@',
  'sales@',
  'reservas@',
  'booking@',
  'admin@',
  'soporte@',
  'support@',
  'atencion@',
];

/**
 * Normalizes and cleans website URLs.
 */
export function normalizeUrl(rawUrl: string): string | null {
  try {
    let url = rawUrl.trim();
    if (!url) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const parsed = new URL(url);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Extracts emails from HTML string, filtering out assets and fake domains.
 */
export function extractEmailsFromHtml(html: string): string[] {
  const emails = new Set<string>();

  // 1. Check mailto links
  const mailtoRegex = /mailto:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRegex.exec(html)) !== null) {
    if (m[1]) {
      const email = cleanEmail(m[1]);
      if (email) emails.add(email);
    }
  }

  // 2. Generic regex in HTML content
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  while ((m = regex.exec(html)) !== null) {
    if (m[0]) {
      const email = cleanEmail(m[0]);
      if (email) emails.add(email);
    }
  }

  return Array.from(emails);
}

function cleanEmail(raw: string): string | null {
  let e = raw.toLowerCase().trim();
  // Strip trailing punctuation often caught in regex
  e = e.replace(/[.,;:!?]+$/, '');

  if (e.length < 5 || e.length > 80) return null;
  if (e.includes('..') || !e.includes('@')) return null;

  for (const ext of IGNORED_EXTENSIONS) {
    if (e.endsWith(ext) || e.includes(ext + '@')) return null;
  }

  const [, domain] = e.split('@');
  if (!domain || !domain.includes('.')) return null;

  for (const ign of IGNORED_DOMAINS) {
    if (domain === ign || domain.endsWith('.' + ign)) return null;
  }

  return e;
}

/**
 * Extracts social media URLs from HTML.
 */
export function extractSocialsFromHtml(html: string): ExtractedLeadData['socialLinks'] {
  const socials: ExtractedLeadData['socialLinks'] = {};

  // Instagram
  const ig = html.match(/https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.-]+)/i);
  if (ig && ig[1] && !['p', 'explore', 'stories', 'reel', 'reels', 'about'].includes(ig[1].toLowerCase())) {
    socials.instagram = `https://instagram.com/${ig[1]}`;
  }

  // Facebook
  const fb = html.match(/https?:\/\/(?:www\.)?(?:facebook\.com|fb\.com)\/(?!sharer|share|plugins|policies|pages)([a-zA-Z0-9_.-]+)/i);
  if (fb && fb[1] && !['sharer', 'share', 'tr'].includes(fb[1].toLowerCase())) {
    socials.facebook = `https://facebook.com/${fb[1]}`;
  }

  // LinkedIn
  const li = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_.-]+)/i);
  if (li && li[0]) {
    socials.linkedin = li[0].split('?')[0];
  }

  // Twitter / X
  const tw = html.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/(?!intent|share)([a-zA-Z0-9_.-]+)/i);
  if (tw && tw[1] && !['intent', 'share', 'i', 'home'].includes(tw[1].toLowerCase())) {
    socials.twitter = `https://x.com/${tw[1]}`;
  }

  // WhatsApp
  const wa = html.match(/https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\/?\?phone=)\/?([0-9+]+)/i);
  if (wa && wa[1]) {
    const num = wa[1].replace(/[^0-9]/g, '');
    if (num.length >= 8) {
      socials.whatsapp = `https://wa.me/${num}`;
    }
  }

  return socials;
}

/**
 * Extracts phone from tel: links in HTML if available.
 */
export function extractPhoneFromHtml(html: string): string | null {
  const telMatch = html.match(/href=["']tel:\s*([+0-9\s().-]+)["']/i);
  if (telMatch && telMatch[1]) {
    const cleaned = telMatch[1].trim();
    if (cleaned.length >= 7) return cleaned;
  }
  return null;
}

/**
 * Safely fetches a web page with timeout.
 */
async function fetchPageHtml(url: string, timeoutMs = 6000): Promise<string | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (Business Directory / Lead Engine)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es,en;q=0.9,fr;q=0.8',
      },
      redirect: 'follow',
    });

    clearTimeout(id);
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;
    }

    return await res.text();
  } catch {
    clearTimeout(id);
    return null;
  }
}

/**
 * Crawls a website to discover business emails and contact details.
 */
export async function crawlWebsiteForLead(rawWebsiteUrl: string): Promise<ExtractedLeadData> {
  const baseOrigin = normalizeUrl(rawWebsiteUrl);
  if (!baseOrigin) {
    return { emails: [], primaryEmail: null, phone: null, socialLinks: {} };
  }

  const foundEmails = new Set<string>();
  let phone: string | null = null;
  let socialLinks: ExtractedLeadData['socialLinks'] = {};

  // 1. Fetch homepage
  const homeHtml = await fetchPageHtml(baseOrigin);
  if (homeHtml) {
    extractEmailsFromHtml(homeHtml).forEach((e) => foundEmails.add(e));
    socialLinks = extractSocialsFromHtml(homeHtml);
    phone = extractPhoneFromHtml(homeHtml);

    // If no emails found on homepage, search for contact links on homepage
    if (foundEmails.size === 0) {
      // Find internal contact links in homepage HTML
      const linkRegex = /href=["']([^"']*(?:contact|contacto|about|nosotros|legal|qui-sommes)[^"']*)["']/gi;
      const discoveredSubpaths = new Set<string>();
      let linkMatch: RegExpExecArray | null;

      while ((linkMatch = linkRegex.exec(homeHtml)) !== null) {
        if (!linkMatch[1]) continue;
        const target = linkMatch[1].trim();
        if (target.startsWith('http')) {
          if (target.startsWith(baseOrigin)) discoveredSubpaths.add(target);
        } else if (target.startsWith('/')) {
          discoveredSubpaths.add(`${baseOrigin}${target}`);
        }
      }

      // If discovered subpaths found, try up to 2
      const candidateUrls = Array.from(discoveredSubpaths).slice(0, 2);
      if (candidateUrls.length === 0) {
        // Fallback to common subpaths
        candidateUrls.push(`${baseOrigin}/contacto`, `${baseOrigin}/contact`);
      }

      for (const subUrl of candidateUrls) {
        const subHtml = await fetchPageHtml(subUrl, 4500);
        if (subHtml) {
          extractEmailsFromHtml(subHtml).forEach((e) => foundEmails.add(e));
          const subSocials = extractSocialsFromHtml(subHtml);
          socialLinks = { ...socialLinks, ...subSocials };
          if (!phone) phone = extractPhoneFromHtml(subHtml);
          if (foundEmails.size > 0) break;
        }
      }
    }
  } else {
    // If homepage directly failed (maybe http vs https issue or redirect), try common paths
    for (const sub of COMMON_CONTACT_SUBPATHS.slice(0, 2)) {
      const subHtml = await fetchPageHtml(`${baseOrigin}${sub}`, 4000);
      if (subHtml) {
        extractEmailsFromHtml(subHtml).forEach((e) => foundEmails.add(e));
        socialLinks = { ...socialLinks, ...extractSocialsFromHtml(subHtml) };
        if (!phone) phone = extractPhoneFromHtml(subHtml);
        if (foundEmails.size > 0) break;
      }
    }
  }

  const allEmails = Array.from(foundEmails);

  // Pick primary email: prefer info@, contacto@, contact@, etc.
  let primaryEmail: string | null = null;
  if (allEmails.length > 0) {
    const preferred = allEmails.find((e) => PRIORITY_PREFIXES.some((p) => e.startsWith(p)));
    primaryEmail = preferred ?? allEmails[0] ?? null;
  }

  return {
    emails: allEmails,
    primaryEmail,
    phone,
    socialLinks,
  };
}

/**
 * Concurrently processes multiple websites with a limit.
 */
export async function crawlBatchWebsites<T extends { website?: string | null }>(
  items: T[],
  concurrency = 4,
): Promise<(T & { crawled: ExtractedLeadData })[]> {
  const results: (T & { crawled: ExtractedLeadData })[] = [];
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      let crawled: ExtractedLeadData = { emails: [], primaryEmail: null, phone: null, socialLinks: {} };
      if (item.website) {
        try {
          crawled = await crawlWebsiteForLead(item.website);
        } catch {
          // Ignore crawl failures
        }
      }
      results.push({ ...item, crawled });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
