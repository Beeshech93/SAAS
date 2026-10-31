import type { RawBusinessLead } from './google-places.provider';

/**
 * Searches businesses using OpenStreetMap (Nominatim API) with extra contact tags.
 * Completely free, no API key required.
 */
export async function searchOpenStreetMap(
  query: string,
  location: string,
  maxResults = 25,
): Promise<RawBusinessLead[]> {
  const searchQuery = location ? `${query}, ${location}` : query;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    searchQuery,
  )}&format=json&addressdetails=1&extratags=1&limit=${Math.min(maxResults, 50)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SaaS-Platform-LeadFinder/1.0 (contact@saasplatform.local)',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return [];
    }

    const items = (await res.json()) as Array<{
      place_id: number;
      name?: string;
      display_name: string;
      type?: string;
      class?: string;
      address?: Record<string, string>;
      extratags?: Record<string, string>;
    }>;

    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => !!(item.name || item.display_name))
      .map((item) => {
        const extra = item.extratags || {};
        const addr = item.address || {};

        const website =
          extra.website ||
          extra['contact:website'] ||
          extra.url ||
          extra['contact:url'];

        const phone =
          extra.phone ||
          extra['contact:phone'] ||
          extra.mobile ||
          extra['contact:mobile'];

        const email = extra.email || extra['contact:email'];

        const city =
          addr.city ||
          addr.town ||
          addr.village ||
          addr.municipality ||
          addr.county ||
          location;

        const country = addr.country;
        const businessName = item.name || item.display_name.split(',')[0] || 'Negocio';

        return {
          externalId: `osm_${item.place_id}`,
          name: businessName,
          category: item.type || item.class || query,
          website: website || undefined,
          phone: phone || undefined,
          address: item.display_name,
          city,
          country,
          source: 'osm' as const,
          metadata: {
            osmId: item.place_id,
            emailTag: email || undefined,
          },
        };
      });
  } catch (err) {
    // Return empty array gracefully if OSM rate-limits or fails
    return [];
  }
}
