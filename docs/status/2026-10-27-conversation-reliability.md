**Accepted contributors now see project messages live, and a conversation that fails to load or send says so and keeps the draft (IR-01, IR-02), 2026-10-27.**

Follows [the internal rollout audit](2026-10-27-internal-rollout-audit.md), which found both.

IR-01: anyone who could read a project conversation included accepted contributors,
engineers on its bookings and that studio's admins, but a new message was sent live
only to the artist and producer. A contributor's open workspace refreshes its
conversation only on that event, so it showed nothing new until reloaded. Reading and
live delivery now come from one list in `project-messages.routes.ts`, sent once per
person. Who can read is unchanged; platform operators keep read access and are not sent
messages live. Separately, the client's stream has no replay and re-read only two query
families on reconnect; it now re-reads open project and booking conversations too
(`useSSE.ts`).

IR-02: `MessageThread` drew a failed load as an empty conversation and gave no sign of a
failed send. It now has separate loading, could-not-load (with Try again), empty and
populated states, and a failed send is shown with Try again and the draft kept. A draft
clears only after the server accepts it. Both booking and project variants.

**Evidence**

- `apps/api/src/integration/project-message-updates.integration.test.ts`, 4 tests:
  artist, producer, accepted contributor, assigned engineer and the booking studio's admin
  hear each message once (the admin is also a contributor, so qualifies twice); the sender,
  a claimed-but-unanswered, declined, correction-requested and removed contributor, an
  unrelated account, another studio's admin and a platform operator hear nothing; the same
  people can read, plus operators; a message sent while disconnected is returned by the
  next read.
- `apps/web/src/components/MessageThread.test.ts`, 6 tests (3 per variant), and
  `apps/web/src/hooks/useSSE.test.ts`, 1 test.
- Defects put back one at a time, each failing its test, file restored: the old
  artist-and-producer audience; duplicate delivery; non-ACTIVE contributors counted; the
  sender hearing their own message; admins of any studio; no error alert; empty state on
  error; failed send hidden; draft cleared on failure; project or booking conversation not
  re-read on reconnect (two checks); re-read on first connect.

| Check | Result |
|---|---|
| Shared build, API and web typechecks | Pass |
| `npm test` | 5, 128 security, 31 intelligence, 124 web in 19 files: all pass |
| `npm run build` | Pass |
| `npm run test:integration:local` (fresh database, 21 migrations, run after the build finished) | 264 of 264 |
| `npm run security:secrets` | Pass |

**Not exercised:** a browser or phone. The session had no browser tooling, so no
multi-account rehearsal was run. 401 and active-studio redirects in `api.ts` were not
changed and were not re-tested here.

**Observed, not changed:** live delivery to studio admins may be noisy for studios with
many linked projects; narrowing it would not change read access. Booking conversations
(`messages.routes.ts`) still broadcast to artist, engineer and producer only; their
readers were not reviewed in this change.
