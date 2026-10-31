import { LeadStatus } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { recordAudit } from '../../lib/audit';
import { crawlBatchWebsites, crawlWebsiteForLead, type ExtractedLeadData } from './crawler';
import { searchGooglePlaces, type RawBusinessLead } from './providers/google-places.provider';
import { searchOpenStreetMap } from './providers/osm.provider';

export interface LeadFinderConfig {
  hasGooglePlacesApiKey: boolean;
  source: 'database' | 'environment' | 'none';
}

export interface SearchLeadsInput {
  query: string;
  location: string;
  provider?: 'auto' | 'google_places' | 'osm';
  maxResults?: number;
  extractEmails?: boolean;
}

export interface DiscoveredLead {
  externalId: string;
  name: string;
  category?: string;
  email: string | null;
  otherEmails: string[];
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  source: 'google_places' | 'osm' | 'web';
  socialLinks?: ExtractedLeadData['socialLinks'];
  hasEmail: boolean;
}

/**
 * Returns configuration status for Google Places API.
 */
export async function getLeadFinderConfig(): Promise<LeadFinderConfig> {
  let dbKey: string | null = null;
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: 'google_places_api_key' },
    });
    if (row?.value) dbKey = row.value.trim();
  } catch {
    // fallback if table does not exist
  }

  if (dbKey) {
    return { hasGooglePlacesApiKey: true, source: 'database' };
  }

  if (env.GOOGLE_PLACES_API_KEY) {
    return { hasGooglePlacesApiKey: true, source: 'environment' };
  }

  return { hasGooglePlacesApiKey: false, source: 'none' };
}

/**
 * Gets the active Google Places API key (from DB or env).
 */
async function getActiveGooglePlacesApiKey(): Promise<string | null> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: 'google_places_api_key' },
    });
    if (row?.value) return row.value.trim();
  } catch {}

  return env.GOOGLE_PLACES_API_KEY || null;
}

/**
 * Saves or updates Google Places API key in DB.
 */
export async function saveGooglePlacesApiKey(apiKey: string, actorId: string): Promise<void> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    await prisma.systemSetting.deleteMany({
      where: { key: 'google_places_api_key' },
    });
  } else {
    await prisma.systemSetting.upsert({
      where: { key: 'google_places_api_key' },
      create: { key: 'google_places_api_key', value: cleanKey },
      update: { value: cleanKey },
    });
  }

  await recordAudit({
    actorId,
    action: 'admin.lead_finder_config_updated',
    targetType: 'SystemSetting',
    targetId: 'google_places_api_key',
    description: cleanKey ? 'Updated Google Places API key' : 'Removed Google Places API key',
  });
}

/**
 * Searches businesses and optionally extracts emails from their websites.
 */
export async function searchLeads(input: SearchLeadsInput): Promise<{
  leads: DiscoveredLead[];
  stats: {
    total: number;
    withEmail: number;
    withPhone: number;
    withWebsite: number;
  };
}> {
  const query = input.query.trim();
  const location = input.location.trim();
  const maxResults = Math.min(Math.max(input.maxResults || 20, 5), 50);
  const extractEmails = input.extractEmails !== false;

  const apiKey = await getActiveGooglePlacesApiKey();

  let selectedProvider: 'google_places' | 'osm' = 'osm';
  if (input.provider === 'google_places') {
    if (!apiKey) {
      throw new Error('Google Places API Key no está configurada. Agrégala en la pestaña de configuración.');
    }
    selectedProvider = 'google_places';
  } else if (input.provider === 'osm') {
    selectedProvider = 'osm';
  } else {
    // auto: prefer google_places if key exists, else OSM
    selectedProvider = apiKey ? 'google_places' : 'osm';
  }

  let rawLeads: RawBusinessLead[] = [];

  if (selectedProvider === 'google_places' && apiKey) {
    rawLeads = await searchGooglePlaces(query, location, apiKey, maxResults);
  } else {
    rawLeads = await searchOpenStreetMap(query, location, maxResults);
    // If OSM returned 0 and we have a Google Places key, try Google Places as fallback
    if (rawLeads.length === 0 && apiKey) {
      rawLeads = await searchGooglePlaces(query, location, apiKey, maxResults);
    }
  }

  if (rawLeads.length === 0) {
    return {
      leads: [],
      stats: { total: 0, withEmail: 0, withPhone: 0, withWebsite: 0 },
    };
  }

  // Crawl websites if requested
  let crawledItems: Array<RawBusinessLead & { crawled?: ExtractedLeadData }> = rawLeads;
  if (extractEmails) {
    crawledItems = await crawlBatchWebsites(rawLeads, 4);
  }

  const leads: DiscoveredLead[] = crawledItems.map((item) => {
    const crawled = item.crawled;
    const directEmail = item.metadata?.emailTag as string | undefined;

    const emails = new Set<string>();
    if (directEmail) emails.add(directEmail.toLowerCase());
    if (crawled?.emails) {
      crawled.emails.forEach((e) => emails.add(e));
    }

    const allEmails = Array.from(emails);
    const primaryEmail = (crawled?.primaryEmail || directEmail || (allEmails.length > 0 ? allEmails[0] : null)) ?? null;
    const otherEmails = allEmails.filter((e) => e !== primaryEmail);

    const phone = item.phone || crawled?.phone || null;
    const website = item.website || null;

    return {
      externalId: item.externalId,
      name: item.name,
      category: item.category,
      email: primaryEmail,
      otherEmails,
      phone,
      website,
      address: item.address || null,
      city: item.city || location || null,
      country: item.country || null,
      rating: item.rating || null,
      reviewsCount: item.reviewsCount || null,
      source: item.source,
      socialLinks: crawled?.socialLinks,
      hasEmail: !!primaryEmail,
    };
  });

  // Calculate statistics
  const stats = {
    total: leads.length,
    withEmail: leads.filter((l) => l.hasEmail).length,
    withPhone: leads.filter((l) => !!l.phone).length,
    withWebsite: leads.filter((l) => !!l.website).length,
  };

  return { leads, stats };
}

/**
 * Crawls a single website on-demand to fetch fresh contact info.
 */
export async function crawlSingleUrl(url: string): Promise<ExtractedLeadData> {
  return crawlWebsiteForLead(url);
}

/**
 * Saves selected discovered leads into the database.
 */
export async function saveDiscoveredLeads(
  leads: Array<{
    name: string;
    category?: string | null;
    email?: string | null;
    otherEmails?: string[];
    phone?: string | null;
    website?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    source?: string | null;
    rating?: number | null;
    reviewsCount?: number | null;
    socialLinks?: any;
    notes?: string | null;
  }>,
  actorId: string,
): Promise<{ savedCount: number; skippedDuplicates: number }> {
  let savedCount = 0;
  let skippedDuplicates = 0;

  for (const lead of leads) {
    if (!lead.name) continue;

    // Check duplicate by email or (name + city)
    let existing = null;
    if (lead.email) {
      existing = await prisma.lead.findFirst({
        where: { email: { equals: lead.email, mode: 'insensitive' } },
      });
    }

    if (!existing && lead.website) {
      existing = await prisma.lead.findFirst({
        where: {
          website: { contains: lead.website.replace(/^https?:\/\//, ''), mode: 'insensitive' },
        },
      });
    }

    if (!existing && lead.name && lead.city) {
      existing = await prisma.lead.findFirst({
        where: {
          name: { equals: lead.name, mode: 'insensitive' },
          city: { equals: lead.city, mode: 'insensitive' },
        },
      });
    }

    if (existing) {
      skippedDuplicates++;
      continue;
    }

    await prisma.lead.create({
      data: {
        name: lead.name,
        category: lead.category ?? undefined,
        email: lead.email ?? undefined,
        otherEmails: lead.otherEmails || [],
        phone: lead.phone ?? undefined,
        website: lead.website ?? undefined,
        address: lead.address ?? undefined,
        city: lead.city ?? undefined,
        country: lead.country ?? undefined,
        source: lead.source || 'google_maps',
        status: LeadStatus.NEW,
        rating: lead.rating ?? undefined,
        reviewsCount: lead.reviewsCount ?? undefined,
        socialLinks: lead.socialLinks || undefined,
        notes: lead.notes ?? undefined,
      },
    });

    savedCount++;
  }

  await recordAudit({
    actorId,
    action: 'admin.leads_imported',
    targetType: 'Lead',
    description: `Imported ${savedCount} leads (skipped ${skippedDuplicates} duplicates)`,
    metadata: { savedCount, skippedDuplicates },
  });

  return { savedCount, skippedDuplicates };
}

/**
 * Lists saved leads with pagination, search, and status filters.
 */
export async function listSavedLeads(options: {
  search?: string;
  status?: LeadStatus;
  city?: string;
  category?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(options.page || 1, 1);
  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const skip = (page - 1) * limit;

  const where: any = {};

  if (options.status) {
    where.status = options.status;
  }

  if (options.city) {
    where.city = { contains: options.city, mode: 'insensitive' };
  }

  if (options.category) {
    where.category = { contains: options.category, mode: 'insensitive' };
  }

  if (options.search) {
    const s = options.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { website: { contains: s, mode: 'insensitive' } },
      { city: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    leads,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Updates status of a saved lead.
 */
export async function updateLeadStatus(id: string, status: LeadStatus, actorId: string) {
  const updated = await prisma.lead.update({
    where: { id },
    data: { status },
  });

  await recordAudit({
    actorId,
    action: 'admin.lead_status_updated',
    targetType: 'Lead',
    targetId: id,
    description: `Updated lead status to ${status}`,
    metadata: { status },
  });

  return updated;
}

/**
 * Deletes a saved lead.
 */
export async function deleteSavedLead(id: string, actorId: string) {
  await prisma.lead.delete({
    where: { id },
  });

  await recordAudit({
    actorId,
    action: 'admin.lead_deleted',
    targetType: 'Lead',
    targetId: id,
    description: 'Deleted lead',
  });
}

/**
 * Exports leads to CSV format with UTF-8 BOM.
 */
export function generateLeadsCsv(leads: Array<{
  name: string;
  category?: string | null;
  email?: string | null;
  otherEmails?: string[];
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  status?: string | null;
  rating?: number | null;
  socialLinks?: any;
}>): string {
  const headers = [
    'Nombre del Negocio',
    'Categoría',
    'Email Principal',
    'Emails Adicionales',
    'Teléfono',
    'Sitio Web',
    'Dirección',
    'Ciudad',
    'País',
    'Instagram',
    'Facebook',
    'LinkedIn',
    'WhatsApp',
    'Estado',
  ];

  const rows = leads.map((l) => {
    const socials = l.socialLinks || {};
    return [
      escapeCsv(l.name),
      escapeCsv(l.category || ''),
      escapeCsv(l.email || ''),
      escapeCsv(Array.isArray(l.otherEmails) ? l.otherEmails.join('; ') : ''),
      escapeCsv(l.phone || ''),
      escapeCsv(l.website || ''),
      escapeCsv(l.address || ''),
      escapeCsv(l.city || ''),
      escapeCsv(l.country || ''),
      escapeCsv(socials.instagram || ''),
      escapeCsv(socials.facebook || ''),
      escapeCsv(socials.linkedin || ''),
      escapeCsv(socials.whatsapp || ''),
      escapeCsv(l.status || 'NUEVO'),
    ].join(',');
  });

  // UTF-8 BOM + headers + rows
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
}

function escapeCsv(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
