**A studio registration answers only after its event is recorded, 2026-10-06.** Registering
a studio wrote its `studio.registered` activity event without waiting for it
(`lib/studioOnboarding.ts`), so the registration could answer before the event existed. The
platform integration test reads the event straight after the answer, and failed CI
intermittently (2026-09-30, and twice on 2026-10-06), holding up unrelated changes.

- **What changed.** The event is awaited, still after the registration's transaction
  commits and still with its failure caught and logged, so a logging failure never fails or
  rolls back a registration.
- **Evidence.** `studio-registration-event.integration.test.ts` holds the `activity_events`
  table locked while a studio registers: the registration must not answer while the event is
  blocked, and the event must exist once it has. With `main`'s unawaited emit the test fails
  three runs of three. Integration 138 of 138 on a fresh database; API unit 102,
  intelligence 31, web 88, both typechecks, the build and the secret scan pass.
- **Observed, not changed.** Signup's `profile.created` events (`auth.controller.ts`) are
  also written without waiting; no test reads them straight away, so they cause no failure.
- Supersedes the separate background task opened for this flake on 2026-09-30, which left no
  branch or pull request.
