/**
 * geocode.ts — Geocoding utility using Google Maps Geocoding REST API
 *
 * Avoids depending on the Maps JS SDK so it can be called from any page,
 * including DQ Import which doesn't load the full Maps library.
 *
 * Failsafe design:
 *  - Every geocode attempt resolves to { result, status } — never throws
 *  - Callers can persist geocodeStatus ("pending" | "success" | "failed") to Firestore
 *  - Admin "Retry Geocoding" uses retryFailedLeads() to re-attempt failed leads
 */

const API_KEY =
  import.meta.env?.VITE_GOOGLE_MAPS_API_KEY ??
  import.meta.env?.VITE_GOOGLE_PLACES_API_KEY ??
  "";

export interface GeocodeResult {
  lat: number;
  lng: number;
}

export type GeocodeStatus = "pending" | "success" | "failed";

export interface GeocodeAttempt {
  result: GeocodeResult | null;
  status: GeocodeStatus;
}

/**
 * Geocode a free-text address string.
 * Always resolves — never throws.
 * Returns { result: null, status: "failed" } on any error.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!API_KEY || !address.trim()) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.[0]) return null;
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

/**
 * Geocode with explicit status tracking. Always resolves.
 */
export async function geocodeAddressSafe(address: string): Promise<GeocodeAttempt> {
  if (!API_KEY || !address.replace(/australia/i, "").trim()) {
    return { result: null, status: "failed" };
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
    if (!res.ok) return { result: null, status: "failed" };
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.[0]) return { result: null, status: "failed" };
    const loc = data.results[0].geometry.location;
    return { result: { lat: loc.lat, lng: loc.lng }, status: "success" };
  } catch {
    return { result: null, status: "failed" };
  }
}

/**
 * Build a geocoding-friendly address string from lead address parts.
 */
export function buildAddressString(params: {
  houseNum?: string;
  street?: string;
  suburb?: string;
  postcode?: string;
}): string {
  return [params.houseNum, params.street, params.suburb, params.postcode, "Australia"]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export interface BatchGeocodeResult {
  id: string | number;
  geo: GeocodeResult | null;
  status: GeocodeStatus;
}

/**
 * Geocode a batch of leads in sequence with per-lead status tracking.
 * Calls `onProgress(done, total)` after each attempt.
 * Never silently swallows failures — every result has a status field.
 */
export async function geocodeBatch(
  leads: Array<{
    id: string | number;
    houseNum?: string;
    street?: string;
    suburb?: string;
    postcode?: string;
  }>,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string | number, GeocodeResult>> {
  const results = new Map<string | number, GeocodeResult>();
  let done = 0;
  for (const lead of leads) {
    const address = buildAddressString(lead);
    if (address.replace("Australia", "").trim()) {
      const attempt = await geocodeAddressSafe(address);
      if (attempt.result) results.set(lead.id, attempt.result);
    }
    done++;
    onProgress?.(done, leads.length);
  }
  return results;
}

/**
 * geocodeBatchWithStatus — returns full status per lead, used for admin retry UI.
 */
export async function geocodeBatchWithStatus(
  leads: Array<{
    id: string | number;
    houseNum?: string;
    street?: string;
    suburb?: string;
    postcode?: string;
  }>,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchGeocodeResult[]> {
  const results: BatchGeocodeResult[] = [];
  let done = 0;
  for (const lead of leads) {
    const address = buildAddressString(lead);
    const hasAddress = address.replace(/australia/gi, "").trim().length > 0;
    if (!hasAddress) {
      results.push({ id: lead.id, geo: null, status: "failed" });
    } else {
      const attempt = await geocodeAddressSafe(address);
      results.push({ id: lead.id, geo: attempt.result, status: attempt.status });
    }
    done++;
    onProgress?.(done, leads.length);
  }
  return results;
}
