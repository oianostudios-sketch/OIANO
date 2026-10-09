**The rest of the studio operator routes follow the staff member's own permission, and the web app hides what the member cannot do, 2026-10-09.**
This continues C34 after [2026-10-09-staff-capability-gates.md](2026-10-09-staff-capability-gates.md),
which gated walk-ins, cash payments and payouts.

**What was wrong.** Booking decisions, engineer assignment, adding equipment and the
whole studio team asked only for the `STUDIO_ADMIN` account role, or (the team routes)
for any `STUDIO_ADMIN` membership. Before the change, the new test showed an `ENGINEER`
membership confirming bookings and assigning engineers, and a receptionist adding
equipment, reading the team, inviting a new `OWNER` with `POLICY_OVERRIDE_ALL`, raising
another member to owner and removing members. The web app offered every action to every
staff member and left the refusal to the server.

**What changed.**

- Each route below now calls `requireStudioCapability` (`apps/api/src/lib/staffPermission.ts`)
  with an existing capability code. The rule is unchanged: the membership holds the code,
  or it is a `STUDIO_ADMIN` membership with no capabilities (the legacy owner). No codes
  were added. Nothing that was stricter was loosened.
- `GET /api/studio/memberships` already returned each membership's role and capabilities
  and the active studio, so the API needed no change for the UI. The web app reads it
  through one hook, `apps/web/src/hooks/useStudioCapabilities.ts`, which mirrors the
  server rule in `apps/web/src/lib/studioCapabilities.ts`. It holds nothing until the
  memberships load, or while a choice between several studios is pending.
- AdminDashboardPage hides the walk-in buttons and form, Confirm, Cancel and No-show, and
  the Team link without the matching capability. RunsheetPage hides Confirm, No-show and
  Record cash. CalendarPage hides Confirm. PulseDashboard hides Confirm and Start, and
  shows the engineer as text instead of the assignment menu. StudioTeamPage explains the
  missing permission and no longer requests the team. Complete stays visible because
  `POST /bookings/:id/complete` is not gated (see below).
- The server's refusal is still the real check. The status and engineer-assignment error
  handlers now show the server's message.
- The web app has no payouts screen, so there was no payouts UI to hide.

**Route decisions.** The presets are the team page's (`apps/web/src/pages/StudioTeamPage.tsx`):
OWNER and MANAGER hold `MANAGE_BOOKINGS`, `MANAGE_CALENDAR`, `MANAGE_STAFF`,
`MANAGE_POLICIES` and `VIEW_FINANCE`. OWNER also holds `POLICY_OVERRIDE_ALL`. RECEPTION
holds `VIEW_CALENDAR`, `MANAGE_CALENDAR` and `MANAGE_BOOKINGS`. ENGINEER and PRODUCER hold
`VIEW_CALENDAR`, `MANAGE_ASSIGNED_SESSIONS` and `UPLOAD_DELIVERABLES` on an `ENGINEER`
membership.

| Route | Decision | Allowed presets |
|---|---|---|
| `PATCH /bookings/:id/status` | Gated: `MANAGE_BOOKINGS` | Owner, manager, reception, legacy owner |
| `PATCH /bookings/:id/engineer` | Gated: `MANAGE_BOOKINGS` (placing staff on a booking manages it) | Owner, manager, reception, legacy owner |
| `POST /facilities/equipment` | Gated: `MANAGE_POLICIES`, the authority `studio-setup.routes.ts` already uses for rooms | Owner, manager, legacy owner |
| `GET /studio/team`, `POST /studio/team/invitations`, `DELETE /studio/team/invitations/:id`, `PATCH /studio/team/:id`, `DELETE /studio/team/:id` | Tightened to `MANAGE_STAFF` through the shared helper. Before, any `STUDIO_ADMIN` membership passed | Owner, manager, legacy owner |
| `POST /admin/walkin`, `POST /admin/bookings/:id/cash-payment` | Already `MANAGE_BOOKINGS` (previous record) | Owner, manager, reception, legacy owner |
| `/payouts/*` | Already `VIEW_FINANCE` (previous record) | Owner, manager, legacy owner |
| `/studio-setup/*` writes, `/studio-policies` writes and approvals | Already gated by their own membership checks (`MANAGE_POLICIES`; policy override capabilities). Unchanged | As before |
| `GET /admin/runsheet`, `GET /engineers/runsheet`, `GET /studio-clock` | Open to any staff membership: today's work | All |
| `GET /admin/analytics`, `GET /studio/pulse` | Open to any staff membership. Both are operational dashboards. Their money figures add up per-booking prices that `GET /bookings` already serves every staff member, and reception's dashboard reads them | All |
| `GET /admin/announcements`, `GET /facilities/rooms`, `/equipment`, `/issues`, `GET /studio-circle/studio`, `/current-work`, `GET /artists`, `GET /studio/navigation-intelligence`, `GET /studio/current` | Open to any staff membership: daily reads | All |
| `POST /admin/announcements` | Left on the account role. No capability names messaging artists | Any `STUDIO_ADMIN` account |
| `PATCH /facilities/issues/:id` | Left on the account role. No capability names facility repair, and the floor staff who report issues advance them | Any `STUDIO_ADMIN` account |
| `POST /studio-circle/:id/request` | Left on the account role. No capability names Circle consent requests | Any `STUDIO_ADMIN` account |
| `POST /bookings/:id/complete`, `POST /bookings/:id/deliver`, `PATCH /bookings/:id/session-notes`, `POST /studio-clock/sessions/:id/activity` | Left as they are. `MANAGE_ASSIGNED_SESSIONS` and `UPLOAD_DELIVERABLES` name these, but the owner, manager and reception presets lack them. Gating would stop owners completing sessions, and "assigned" needs an assignment check that does not exist yet | `STUDIO_ADMIN` or `ENGINEER` account at the studio |
| `POST /payments/stripe/checkout-session` (staff assist) | Left: a Stripe route, outside this change's scope | Any `STUDIO_ADMIN` account at the studio |
| `GET /feedback`, `PATCH /feedback/:id` | Left: not studio-scoped (see below) | Any `STUDIO_ADMIN` or `OIANO_ADMIN` account |

**Evidence.** `apps/api/src/integration/staff-gates-rest.integration.test.ts` has 21
subtests. Its table covers 5 memberships (owner, manager, reception, engineer, legacy
owner) and 18 routes. Every caller holds the `STUDIO_ADMIN` account role, so only the
membership decides. For each gated route, an allowed preset gets 200, 201 or 204 and
every other preset gets 403 with the refusal message. The open reads give every preset
200. Other checks:

- A refused status change, a refused promotion of a member and a refused invitation each
  leave the database unchanged.
- `/studio/memberships` reports the active membership's role and capabilities.

`apps/web/src/pages/staffCapabilityUi.test.ts` has 10 tests:

- The rule and active-membership helpers.
- The hook: reception, the legacy owner and an engineer, and a failed read, which holds
  nothing.
- AdminDashboardPage for reception, a `VIEW_FINANCE`-only member and the legacy owner.
- StudioTeamPage for reception and the legacy owner.

Results:

- **Against `origin/main` (beadff8):** 8 route subtests failed. The failures were
  `ENGINEER should be refused` on status and engineer assignment, and
  `RECEPTION should be refused` on equipment and all five team routes.
- **Mutation: gate removed from `updateBookingStatus`.** Its subtest failed
  (`ENGINEER should be refused`), and so did the "refusal changes nothing" subtest
  (18 pass, 3 fail including the parent).
- **Mutation: the web rule passes any `STUDIO_ADMIN` membership.** 5 of the 10 web tests
  failed.
- Both mutated files were restored from `cp` backups, and `cmp` confirmed them
  byte-identical.

All checks pass:

- Both typechecks.
- `npm test`: API unit 119/119, intelligence 31/31, web 113/113.
- `npm run test:integration:local`: 225/225 on a fresh database.
- `npm run build`.
- `npm run security:secrets`, over 502 files.

**Not exercised.** The pages were not driven in a browser. The web tests render the
dashboard and the team page in jsdom. The calendar, runsheet and pulse changes were
checked only by typecheck and build.

**Observed, not changed.**

- `GET /api/feedback` returns every user's feedback, with emails, across all studios to
  any `STUDIO_ADMIN` account. `PATCH /api/feedback/:id` lets that account change any
  report's status.
- `POST /api/facilities/equipment` accepts a `room_id` without checking that the room
  belongs to the caller's studio.
- `DELETE /studio/team/:id` still counts "managers" as any `STUDIO_ADMIN` membership or
  any holder of `MANAGE_STAFF`. That count is more permissive than the new gate, so it can
  only refuse more deletions, never fewer.
