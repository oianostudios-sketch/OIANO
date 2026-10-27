**The first five participants have an actionable private intake invitation and
onboarding readiness checklist; real-use approval remains withheld, 2026-10-27.**

Added [FIRST_FIVE_CHECKLIST.md](../internal-rollout/FIRST_FIVE_CHECKLIST.md) and
linked it from the rollout/intake indexes. It reuses the approved questionnaire,
names the five participant practices without personal details, distinguishes
intake from account onboarding, and lists evidence required before real work.
No questionnaire answers, actual invitations, tokens or personal data were added.

Checked the current account/signup, onboarding, protected routes, contribution
invitation/claim/respond, studio staff acceptance, discipline choices and password
recovery source. Existing local test/build evidence is reused, not presented as
deployed or browser evidence.

## Findings and next implementation

- `App.tsx` preserves the protected destination in `next`, but `EnterPage` honors
  it only for Artist accounts. Professional signup and onboarding also drop it.
  Added proposed T09 to the backlog: preserve the safe internal destination across
  sign-in/MFA and professional onboarding, with focused regression tests and no
  permission or schema changes.
- Poets and cinematographers have no exact profile discipline; the contribution
  role list offers `OTHER`. Confirm labels privately rather than assigning a
  false practice. A missing truthful option may keep a person intake-only.
- Public signup does not provision staff accounts in its UI. Existing studio
  accounts need correct memberships/capabilities and MFA; accepting a membership
  on a creative account does not grant studio-tool access.
- Contributor uploads, independent delivery/review and depicted-contributor usage
  consent are not supported by today's flows. The checklist makes these explicit
  exclusions or owner/participant decisions, not claimed capabilities.
- Deployed revision/address, support/recovery owner, storage, recovery mail, a
  demonstrated restore, payment boundaries and phone/browser rehearsal remain
  unverified. Production parity is separately required for canonical migration.

## Evidence

Source links appear in the checklist. Local links in the changed rollout documents
were checked, and staged whitespace/secrets checks pass before commit. This is
documentation only: no product behavior was changed and no new application tests
were needed. Prior 264/264 integration and build/typecheck results were not rerun.

## Not exercised

No participant contact, account provisioning, private record access, synthesis,
browser/phone rehearsal, external mail/upload/payment, publication, push,
deployment or production access. No actual participant is marked onboarded.
The invitation-routing finding is source evidence, not a reproduced browser result.

## Observed, not changed

PR #54 and its original branch are preserved. The historical architecture proposal,
its pending root documentation-index link and local VS Code settings are untouched
and remain uncommitted. The current gate still does not authorize canonical migration.
