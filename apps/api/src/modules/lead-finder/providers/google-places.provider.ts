export interface RawBusinessLead {
  externalId: string;
  name: string;
  category?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  rating?: number;
  reviewsCount?: number;
  source: 'google_places' | 'osm' | 'web';
  metadata?: Record<string, any>;
}

export async function searchGooglePlaces(
  query: string,
  location: string,
  apiKey: string,
  maxResults = 20,
): Promise<RawBusinessLead[]> {
  const searchQuery = location ? `${query} in ${location}` : query;
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    searchQuery,
  )}&key=${apiKey}`;

  const res = await fetch(searchUrl, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Google Places API error (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results: Array<{
      place_id: string;
      name: string;
      formatted_address?: string;
      rating?: number;
      user_ratings_total?: number;
      types?: string[];
    }>;
  };

  if (data.status === 'REQUEST_DENIED') {
    throw new Error(data.error_message || 'Clave de Google Places API inválida o denegada.');
  }

  if (!data.results || data.results.length === 0) {
    return [];
  }

  const places = data.results.slice(0, maxResults);

  // Fetch Place Details in parallel (up to 5 concurrent)
  const leads: RawBusinessLead[] = [];
  const queue = [...places];

  async function detailWorker() {
    while (queue.length > 0) {
      const place = queue.shift();
      if (!place) break;

      try {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${
          place.place_id
        }&fields=name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,url,types&key=${apiKey}`;

        const detailRes = await fetch(detailUrl, { headers: { Accept: 'application/json' } });
        if (detailRes.ok) {
          const detailData = (await detailRes.json()) as {
            result?: {
              name?: string;
              formatted_address?: string;
              formatted_phone_number?: string;
              international_phone_number?: string;
              website?: string;
              rating?: number;
              user_ratings_total?: number;
              types?: string[];
            };
          };

          const d = detailData.result;
          leads.push({
            externalId: place.place_id,
            name: d?.name || place.name,
            category: (d?.types && d.types[0]) || (place.types && place.types[0]) || query,
            phone: d?.international_phone_number || d?.formatted_phone_number,
            website: d?.website,
            address: d?.formatted_address || place.formatted_address,
            city: location,
            rating: d?.rating || place.rating,
            reviewsCount: d?.user_ratings_total || place.user_ratings_total,
            source: 'google_places',
          });
        } else {
          // Fallback with minimal info
          leads.push({
            externalId: place.place_id,
            name: place.name,
            category: place.types && place.types[0],
            address: place.formatted_address,
            city: location,
            rating: place.rating,
            reviewsCount: place.user_ratings_total,
            source: 'google_places',
          });
        }
      } catch {
        leads.push({
          externalId: place.place_id,
          name: place.name,
          category: place.types && place.types[0],
          address: place.formatted_address,
          city: location,
          rating: place.rating,
          reviewsCount: place.user_ratings_total,
          source: 'google_places',
        });
      }
    }
  }

  const workers = Array.from({ length: 4 }, () => detailWorker());
  await Promise.all(workers);

  return leads;
}

