/** Server-side formatting utilities — mirrors apps/web/src/lib/fmt.ts */

export function fmtTime(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  });
}

export function fmtDateLong(iso: string, tz?: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz,
  });
}
