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
