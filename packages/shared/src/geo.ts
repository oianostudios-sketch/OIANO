// packages/shared/src/geo.ts
//
// Documentation-only shape for "where" data as Oiano starts collecting it.
// Not enforced anywhere yet — nothing in the schema or API is typed against
// this today. It exists so the next geo-touching feature has one agreed
// shape to grow into instead of each place inventing its own fields.
//
// PLACE GIVES CONTEXT, IT ISN'T IDENTITY: this describes where someone is
// creating from or operating, never who they are or what sound they make.
// Precision stops at city/country — no coordinates, no continuous tracking.
export interface GeoContext {
  country: string | null;
  countryCode: string | null;
  city: string | null;
  timezone: string | null;
  currency: string | null;
  locale: string | null;
}

// The first real (non-documentation-only) use of this file: derive a coarse,
// honest region label from an IANA timezone id — real data Studio already
// stores, not a new field, not a geocoding call. IANA ids are Continent/City
// by convention, so this is exact where it applies and never invents a
// country. This is OPERATING LOCATION (where a studio runs), not identity —
// same "place gives context" boundary as everywhere else in this file.
export interface DerivedRegion {
  continent: string;
  city: string;
  label: string;
}

export function deriveRegionFromTimezone(timezone: string): DerivedRegion {
  const parts = timezone.split('/');
  const continent = parts[0] || 'Unknown';
  const city = (parts[parts.length - 1] || timezone).replace(/_/g, ' ');
  return { continent, city, label: `${city}, ${continent}` };
}
