**Studio analytics count the studio's own day, 2026-10-07.** `GET /api/admin/analytics`
bucketed bookings and payments by the UTC day (`toISOString().slice(0, 10)`) and took
"today" as the UTC day, and `GET /api/studio/pulse` and
`GET /api/studio/navigation-intelligence` cut "today" and "this week" at the server's
midnight (`setHours(0, 0, 0, 0)`). A 23:15 session in Los Angeles counted on the next day,
and a 00:15 session in Tokyo on the day before. The analytics also built 7 day buckets and
then took this week as `days.slice(7)`, so `week_revenue_usd` and `week_sessions` always
read zero and the "prior week" was in fact this week.

- **What changed.** All three studio-scoped endpoints take their days from the studio's
  `timezone` through `lib/studioClock.ts` (`studioDate`, `studioDateBounds`, and a new
  `addCalendarDays`), as the runsheets and the clock already do (C29). The analytics build
  14 studio days, return the last 7 as `weekly_days` (still 7 entries), and total this week
  and the prior week from them. The pulse week starts on the studio's own Sunday. No amount,
  query filter on money, or ledger code changed; only which day an existing row falls on.
- **Left UTC on purpose.** `GET /api/maintenance/summary` (OIANO_ADMIN, network-wide across
  every studio's zone) keeps UTC days, now said in a comment there. `network-pulse` and the
  network-metrics studio figures use rolling 24-hour and 30-day windows, not calendar days,
  and were not changed.
- **Evidence.** `analytics-studio-day.integration.test.ts` books half-hour sessions either
  side of both of the studio's midnights in an `America/Los_Angeles` and an `Asia/Tokyo`
  studio, against the real clock, with local times turned into instants through `Intl` only.
  It asserts today's sessions, the 7 dated sparkline buckets, the week totals, and the
  pulse's today hours, today's booked amount, week sessions and week collected. Mutation:
  with `main`'s `admin.routes.ts` both zones fail (today's sessions differ); with `main`'s
  `pulse.routes.ts` both fail (`today_booked_usd` 1100, expected 110). Integration 155 of
  155 on a fresh database; API unit 102, intelligence 31, web 88, both typechecks, the build
  and the secret scan pass.
- **Not exercised.** `navigation-intelligence`'s remaining-today count feeds only the AI
  recommendation, which is disabled under test, so no test observes it. The artist stats in
  `stats.routes.ts` (year start at the server's January 1) and the passport view counts are
  per-person, not per-studio, and were not changed.
