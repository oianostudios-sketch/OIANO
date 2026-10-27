**T09 is implemented locally: invitation destinations survive authentication and onboarding; physical-phone verification remains open.**

2026-10-27. Supersedes only the routing blocker recorded in
[first-five preparation](2026-10-27-first-five-preparation.md).
Work remains on `chore/reviewed-local-checkpoint`; nothing is pushed or deployed.

## What changed

- Shared [return-destination validation](../../apps/web/src/lib/returnDestination.ts)
  accepts internal absolute paths, preserving query/token encoding and fragments.
  External/protocol-relative URLs, backslashes, whitespace/control characters and
  paths normalizing to double-leading slashes are rejected.
- [Entry](../../apps/web/src/pages/EnterPage.tsx) honors a safe destination for all
  five existing account roles. Artist and Creative professional signup carry it
  into their respective onboarding pages. Existing default destinations remain.
- [Professional onboarding](../../apps/web/src/pages/ProfessionalOnboardingPage.tsx)
  returns only after saving and refreshing the account. Artist onboarding uses
  the same validator instead of a separate, weaker check.
- The [API interceptor](../../apps/web/src/lib/api.ts) still clears authentication
  and rejects a 401. On `/enter` only, it does not reload `/login`: the form can
  show rejected credentials/MFA and retain `next` and the MFA challenge. The old
  redirect outside entry and the studio-selection 409 behavior are unchanged.
- No API endpoint, route-role guard, studio scope, account-role policy, schema,
  ledger or payment behavior changed. Claiming an invitation still does not accept
  its contribution.

## Automated evidence

| Check | Result |
|---|---|
| Existing web baseline | 124/124 passed, exit 0 |
| Defect-first routing assertions | 12 failures before fixing entry/professional routing, exit 1; correct destinations, MFA retry, signup and unsafe fallback assertions caught the defect |
| Defect-first interceptor assertion | 1 failure before the entry-page 401 fix, exit 1; observed unwanted `/login` assignment |
| Complete web suite after fixes | `npm run test --workspace=apps/web`: 180/180, 23 files, exit 0 |
| Web typecheck | `npm run typecheck --workspace=apps/web`: exit 0 |
| Web build | `npm run build --workspace=apps/web`: exit 0 |
| Editor diagnostics | No errors in the ten changed/new source and test files |
| Secrets / whitespace / links | Secret scan passes across 567 tracked files; staged whitespace check passes; 30 local Markdown links verified |

New tests run through the existing canonical web suite: validator cases,
[entry](../../apps/web/src/pages/EnterPage.test.ts), [professional
onboarding](../../apps/web/src/pages/ProfessionalOnboardingPage.test.ts),
[completed Artist onboarding](../../apps/web/src/pages/OnboardingSequencePage.test.ts),
and [API interception](../../apps/web/src/lib/api.test.ts). No new dependencies.

## Local browser evidence

Started `npm run dev:local`. Confirmed API `/health` and web `/enter` returned 200.
The runner reported this checkout's `oiano_dev_test` at loopback port 55432,
`NODE_ENV=test`, with external services disabled. Node v24.16.0 and the integrated
Playwright browser were available; no Docker, browser install or substitute
database was needed. No shared `.env` database URL was used.

Each journey used a separate browser context against the actual local API, with
synthetic identities, projects and invitations, not mocked browser responses:

1. **Desktop professional:** signed-out invitation -> signup -> professional
   onboarding with exact `next` -> save -> original invitation -> claim -> inbox.
   Reload retained the claimed record and saved professional onboarding flag.
   Visiting studio tools still displayed the existing access boundary.
2. **Returning professional:** bad password produced a visible error without
   losing `next`; corrected password returned to the exact invitation.
   A studio-only `next` still displayed the access boundary. Anonymous inbox
   returned 401; an unowned project and a claimed-but-not-accepted workspace
   returned 404.
3. **Artist at 390 x 844:** signup -> identity -> availability -> first-session
   explanation -> formation -> original invitation -> claim -> inbox -> reload.
   Completion persisted in `/auth/me`; the invitation screen had no horizontal
   overflow. This was mouse-driven responsive testing, not real touch input.
4. **Actual platform MFA:** a dedicated synthetic local platform user enrolled,
   retried an invalid TOTP without losing the challenge/destination, then returned
   to the invitation after valid TOTP. Reload and a second sign-in using returning
   MFA verification also preserved it. An unknown invitation was refused by the
   unchanged API. No real MFA credentials were requested or existing account
   credentials changed.
5. **Returning studio staff:** a separate actual local `STUDIO_ADMIN` session
   returned to the exact invitation after sign-in and retained it on reload.
   The unchanged API refused an unknown token. The fixture used the existing
   studio-registration API with a unique synthetic studio, not an upgrade of an
   existing account or a duplicate real studio.

Browser tool assertions completed without exception after correcting rehearsal
code/API assumptions; they are interactive evidence, not a committed CLI E2E
suite or a fabricated process exit code. The browser host's request-context
cookie API was unavailable, so setup used browser `fetch` to the local API.
Touch-emulated clicking timed out; the responsive Artist flow was rerun without
touch emulation and passed. An existing demo-platform login did not produce the
needed challenge, so it was not altered; a dedicated local fixture was used.

The synthetic project was archived through its owner's API. Browser contexts
were closed and temporary browser fixture credentials removed. Audit immutability
correctly refused deletion of the MFA fixture's audit history; no trigger or
guard was bypassed. Its password was randomized without retention, MFA secret
cleared and sessions invalidated instead. Its identity/audit rows and synthetic
creative/staff accounts and the synthetic studio remain only in the local test
database. The temporary MFA fixture script and generated local task definition
were removed; pre-existing VS Code settings were not changed.

## Not exercised / remaining gate

- **Physical phone and real touch input:** not connected/verified. The local
  runner embeds `http://localhost:<api-port>` for the API, so a phone opening the
  LAN web address alone cannot exercise the same backend. A separately agreed
  local-only connection setup and a person operating the phone are required.
- MFA is currently a platform-role flow; T09 did not add MFA requirements to
  other roles. Studio membership invitations themselves were not accepted in
  the browser; this change does not alter their existing API or acceptance UI.
- The broader messaging, booking, multi-studio, storage, recovery, mail and
  payment rollout checklist remains open; this is not full T04 or launch sign-off.
- No API code changed, so the prior 264-pass isolated integration checkpoint was
  reused rather than rerun. No current production parity or deployment claim.

**Verdict:** local implementation, automated regression coverage and desktop/
responsive browser journeys pass. Device acceptance is **NEEDS_SIGNOFF** until
a real-phone rehearsal is completed. The approved questionnaire, PR #54 branch,
unreviewed architecture proposal, pending document-index link and local VS Code
settings remain untouched.
