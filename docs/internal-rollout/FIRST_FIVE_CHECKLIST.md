# First five participants: invitation and onboarding checklist

2026-10-27. **Ready to organize private intake, not approved for real-work reliance.**
No participant has been contacted by this work. Do not publish this draft as a
launch announcement or imply that local code is deployed.

## 1. Owner actions before sending anything

- [ ] Confirm the first five people privately: one producer, one poet, one
  cinematographer, one studio manager, and one artist who works across studios.
  Keep names, addresses, client details and record-ID mappings out of this public
  repository.
- [ ] Confirm the contact channel and permission to send each invitation.
- [ ] Confirm who owns intake, participant support, operational recovery and the
  eventual go/no-go decision. Do not invent contacts or a pilot URL.
- [ ] Use the existing [questionnaire](intake/QUESTIONNAIRE.md), or its
  [print version](intake/questionnaire-print.html). The owner keeps responses and
  [records](intake/RECORD_TEMPLATE.md) in the agreed private storage; use only
  anonymized record IDs in [synthesis](intake/SYNTHESIS.md).
- [ ] Ask for one real recent piece of work, not an imagined OIANO workflow.
  Participation in intake does not require an OIANO account or acceptance of a
  product limitation.

## 2. Invitation draft - owner sends privately after approval

> Hi [name], we are preparing a small, supervised OIANO trial with people we
> already work with. Before asking you to rely on it, we want to understand how
> you actually work.
>
> Could you walk us through one recent piece of work using the attached
> questionnaire? Written answers, voice notes or a 30-45 minute conversation
> are all fine. You can skip questions. Please do not send passwords, invitation
> tokens, private media or other people's personal details.
>
> Your answers will stay private. We will show you our understanding for you to
> confirm or correct before proposing changes. You can ask us to change or
> delete your answers.
>
> This is an intake invitation, not notice that the product is ready or a request
> to move real work or payments into it. If you want to take part, please reply
> privately with your preferred format and a suitable time.

Replace placeholders privately and attach the questionnaire; no account or
project invitation token belongs in the committed draft.

## 3. Account and workflow readiness - checked against current source

| Participant | Existing path | Limitation or required check |
|---|---|---|
| Producer lead | `/enter`, Creative professional account; `/professional/onboarding`, then project creation | The account uses the legacy `PRODUCER` role. Confirm this person genuinely leads the work; do not make someone a project lead just to bypass today's permissions. Confirm the saved name/disciplines after reload. |
| Poet | Private intake first; project contribution can be claimed by an authenticated account | There is no Poet/Writer discipline, and the project role list offers `OTHER`. Do not choose an inaccurate discipline for them. The person must confirm an acceptable current account/label choice or remain intake-only until a supported path is agreed. |
| Cinematographer | Private intake, then approved account and contribution invitation | No exact Cinematographer discipline. Videographer is an available label, not an automatic equivalence. Contributor uploads and independent deliverable review are not supported; check real file sizes before agreeing a trial. |
| Studio manager | Existing authorized studio account, any required MFA, `/admin/team`, and correct active studio | Public `/enter` signup offers Artist/Creative professional, not studio staff provisioning. A creative account accepting a studio membership does not gain studio tools. If no suitable authorized account exists, stop for the operator's approved onboarding process; do not create a duplicate studio or upgrade roles in the database. |
| Artist across studios | `/enter`, Artist account, `/onboarding`; select the actual studio when booking | No default studio membership. Confirm only their own bookings/outputs are visible and staff cannot read another studio's private records. Booking and payment readiness are separate gates. |

Source anchors:
[account signup/login](../../apps/web/src/pages/EnterPage.tsx),
[artist onboarding](../../apps/web/src/pages/OnboardingSequencePage.tsx),
[professional onboarding](../../apps/web/src/pages/ProfessionalOnboardingPage.tsx),
[discipline list](../../apps/web/src/lib/creativeDisciplines.ts),
[project invitations](../../apps/api/src/routes/producer.routes.ts),
[claim screen](../../apps/web/src/pages/AcceptContributionInvitePage.tsx),
[contribution API](../../apps/api/src/routes/contributions.routes.ts),
[staff acceptance](../../apps/web/src/pages/AcceptStudioInvitePage.tsx), and
[staff invitations](../../apps/api/src/routes/studio.routes.ts).

### Invitation continuity - T09 implemented locally, not deployed

Sign-in now honors a validated internal `next` for every account role. New Artist
and Creative professional accounts carry it through their respective onboarding.
Rejected credentials or MFA codes stay on the entry page with their error, rather
than reloading and losing the destination or pending MFA challenge. Unsafe or
absent destinations retain the previous home/onboarding fallbacks.

Separate local browser sessions exercised professional and Artist signup,
onboarding, claiming, reload persistence, returning sign-in, and platform MFA
setup/verification. Existing role and API access boundaries still refuse access.
See the [T09 evidence and remaining limits](../status/2026-10-27-invitation-return-continuity.md).
The 390px Artist rehearsal was mouse-driven browser emulation, not a physical
phone test. Do not treat this local fix as deployed or the wider section 4
checklist as complete. On an older deployment, the supervised workaround remains:
finish sign-in/onboarding, then reopen the original private link.

## 4. Supervised onboarding rehearsal - local data before real accounts

Use the existing isolated `npm run dev:local` workflow, never the shared `.env`
database. Use synthetic identities and non-sensitive files; do not reuse real
participant passwords, tokens or media. Existing automated evidence is not a
browser or phone result.

- [ ] Start with the intended account signed out. Open a contribution invitation;
  verify sign-in/signup, onboarding and return to the exact invitation. Include
  Artist and Creative professional accounts and a returning staff account.
- [ ] The actual producer creates a project and an email-bearing contribution
  invitation, then passes its single-use link privately. An external participant
  record without an email does not create an account invitation.
- [ ] Recipient claims the link, reviews the project and role, and chooses accept,
  decline or request correction. Claiming is not acceptance.
- [ ] Once accepted, sender and contributor exchange messages in separate browser
  sessions; refresh and reopen to confirm persistence.
- [ ] Disconnect/reconnect the contributor. Confirm missed messages are recovered.
  Simulate failed loading and sending; confirm an explicit error and retained draft.
- [ ] Remove a synthetic contributor. Confirm workspace/read access is refused and
  new live messages are not delivered. Confirm an unrelated account is refused.
- [ ] Staff select the intended studio and test only their granted capabilities;
  verify an unrelated studio cannot access the work.
- [ ] Artist sees only their own bookings and permitted outputs across studios.
  Rehearse booking attachment/detachment and reopen the project.
- [ ] Test at least one real phone; record browser/OS, revision, scenario and
  pass/fail without names, private messages or token-bearing URLs.
- [ ] Verify login expiry and recovery with a test account. A generic
  forgot-password success response is not evidence that recovery mail arrived.

## 5. Real-use release checklist - owner/operator must supply evidence

| Gate | Required evidence | Current status |
|---|---|---|
| Intended deployment | Owner-approved HTTPS address, deployed commit, front-end/API pairing, support/recovery owner | Not supplied; local commits are unpushed |
| Browser and mobile journeys | Completed section 4 with failures recorded and resolved | T09 onboarding rehearsed locally in separate sessions, including a 390px viewport; real phone and wider section 4 scenarios remain pending |
| Storage | Authorized upload/download on the intended environment; realistic sizes; private access and recovery verified | Not verified; artist-file cap is 200 MiB and contributors cannot upload |
| Recovery | Successful isolated backup restore, restore date, owner and procedure | Not demonstrated here |
| Mail | Approved invitation delivery and password-reset delivery tested with controlled accounts | Not verified; contribution links are returned to the producer to share |
| Money | Explicit decision on whether money moves; verified supported settlement method if it does | Undecided; disabling Stripe does not make bookings free or prove cash/wallet readiness |
| Participation boundaries | Each person confirms labels, access, reviewer, delivery method and temporary limitations | Awaiting intake; current deliverables require a booking and only its Artist reviews |
| Rights and consent | Correct parties can agree to actual usage terms; no proxy consent | Depicted contributors cannot answer the project's Artist-only promotional-consent flow; exclude that use or use a separately agreed process outside OIANO |
| Canonical migration | Passing authorized production parity for exact proposed head plus gate sign-off | Blocked; local schema parity alone does not approve migration |

Production parity is a canonical-migration gate, not proof that any deployment is
operationally ready. Intake can proceed without it. Real use of today's features
still requires the relevant operational gates above and explicit owner approval.

## 6. Per-person completion - store the filled checklist privately

- [ ] Consent to keeping intake answers; private record ID assigned.
- [ ] One recent example recorded in their words; proposals returned for confirmation.
- [ ] Intended account and role labels agreed without inventing their profession.
- [ ] When approved for a trial: correct account, claimed/accepted contribution,
  permitted workspace, message persistence and support route demonstrated.
- [ ] Unsupported delivery, payment or consent needs explicitly accepted as
  limitations, or the workflow stays outside the trial.
- [ ] No unresolved access, data-loss, recovery or payment blocker.
- [ ] Owner approves the scope; participant agrees to the first real work item.

After three confirmed records, begin anonymized synthesis; completion of the
round still needs at least five confirmed private records. Do not fabricate
answers or mark anyone onboarded from source inspection alone.
