# Implementation report: batch 1, conversation reliability

2026-10-27 · Claude Code, continuing from the Codex readiness audit · for the owner

**Later evidence:** the historical browser gap described below is now partially
superseded by [T09 onboarding](../status/2026-10-27-invitation-return-continuity.md)
and [T04 contributor-browser rehearsal](../status/2026-10-27-contributor-browser-rehearsal.md).
Project-message live exchange, forced reconnect, GET/POST failure recovery and
removal/unrelated refusal were exercised in separate local browser contexts.
Phone, booking-thread and wider studio-scope/attachment rehearsal remain open.
The original batch results below are preserved as history.

## 1. Outcome

Project conversations now behave the way a team relies on them to:

- When anyone posts in a project conversation, everyone in that work sees it without
  refreshing. That includes a poet, cinematographer or other creative who accepted
  their invitation, not only the artist and producer.
- People who were only invited, said no, asked for a correction, were removed, or have
  nothing to do with the work get nothing.
- If someone's connection drops and comes back, their open conversation catches up on
  what they missed.
- If a conversation can't load, it says so and offers Try again. It no longer looks
  empty.
- If a message can't be sent, it says so, keeps what you typed and offers Try again.

All of this is verified by automated tests on a local database. It has **not** been
tried in a browser or on a phone yet (section 5).

## 2. Tasks completed and findings resolved

| Item | Status |
|---|---|
| T02 / IR-01 contributor message updates | Done locally. Every acceptance criterion is covered by an integration test |
| T02 reconnect recovery | Done. The client re-reads open conversations on reconnect, and the server returns messages sent while you were away |
| T03 / IR-02 load and send failures | Done for booking and project conversations, covered by component tests |
| T04 automated verification | Done: clean full integration run, 264 of 264 |
| T04 multi-account browser and phone rehearsal | **Not done** (no browser tooling in this session) |

The rules chosen for who gets live updates (staff and engineers who can already read now
also get them live; platform operators don't) are written down in DECISIONS.md under
"Implementation choices in batch 1". You can reverse them.

## 3. Files changed

Product code:
- `apps/api/src/routes/project-messages.routes.ts`: one list of conversation members
  decides both who can read and who hears live.
- `apps/web/src/hooks/useSSE.ts`: re-reads conversations after a reconnect.
- `apps/web/src/components/MessageThread.tsx`: loading, error, empty and failed-send
  states.

Tests (new):
- `apps/api/src/integration/project-message-updates.integration.test.ts`
- `apps/web/src/components/MessageThread.test.ts`
- `apps/web/src/hooks/useSSE.test.ts`

Documents: this report; `HANDOFF.md`, `BACKLOG.md`, `DECISIONS.md` and `AUDIT.md`
(status notes on IR-01 and IR-02) in this folder; and
`docs/status/2026-10-27-conversation-reliability.md`.

Commits are on the local branch `claude/conversation-reliability`, created from
`main`:
- `80f161d`: code and tests.
- The commit after it: these documents.

Nothing was pushed, merged or deployed. The working checkout stays on its own branch
(PR #54).

## 4. Tests actually run

| Check | Result |
|---|---|
| New integration test, focused, fresh local database | 4 of 4 |
| New web tests, focused | 7 of 7 |
| Defects put back on purpose to prove the tests catch them | 14 of 14 caught; every file restored |
| Shared build; API and web typechecks | Pass |
| `npm test` | 5 repository, 128 security, 31 intelligence, 124 web: all pass |
| `npm run build` | Pass |
| `npm run test:integration:local`, fresh database, run after the build | **264 of 264**, a clean single run |
| `npm run security:secrets` | Pass |

All tests ran on this machine's own PostgreSQL. No shared or production database was
touched.

## 5. Browser journeys exercised

None. This session had no browser automation, so none of the six rehearsal steps was
performed in a browser. The integration test reproduces steps 1–3 and 6 through the
real API and live stream. The component tests reproduce steps 4–5 in a simulated page.
That is strong evidence, but it is not the same as a person on a phone.

## 6. Not verified

- The six-step rehearsal on a real browser and phone, with separate accounts.
- Behaviour behind a real proxy or on a flaky mobile connection.
- Booking conversations: their recipients were not reviewed. Only their error handling
  changed.
- Sign-in expiry and studio-selection redirects. They weren't changed, but weren't
  re-tested either.
- Everything under IR-05: the deployed version, file storage, email, backup restore and
  payments.

## 7. Remaining pilot blockers

1. **Rehearsal (T04).** Run the six steps with real accounts on at least one phone.
2. **Operational readiness (IR-05 / T05).** We need to know where the pilot runs and
   which version is deployed. A backup restore needs to have been demonstrated, and a
   real file upload and download needs to have worked.
3. **Production parity.** The stabilization gate is still recorded as not passed: gate 2
   waits on the production schema comparison (PR #54 is about that check). This
   doesn't block using today's features. It does block the canonical migration, and
   with it everything in section 9 beyond small fixes.
4. **Your answers in section 8.**

## 8. Decisions and information needed from you

- Which environment and web address the pilot will use, and who the recovery owner is.
- Whether any money moves in the first weeks. If it does, the payment path needs its
  own check. If not, agree that payment happens outside OIANO for now.
- Whether a producer always starts the work during the pilot. Today only a producer
  account can create a project.
- Whether studio admins getting every linked project's messages live is wanted (section
  2).
- A first real piece of work to run end to end, and who is on it.

## 9. Next recommended batch, in priority order

1. **Supervised rehearsal (T04 remainder).** Use `npm run dev:local` and the seeded demo
   accounts, plus one invited contributor. Walk through the six steps and record the
   results here. No code unless something fails.
2. **Creative intake round (T01).** Collect CREATIVE_INTAKE.md answers from one
   producer, the poet and one cinematographer, using one recent real piece of work
   each. Fill in the mapping sheet and keep these separate: what they said, what OIANO
   supports, what we propose, and what they confirmed. No code.
3. **Truthful contributor labels, the smallest fix (part of T06).** Today a poet,
   cinematographer or model can only be recorded as `OTHER`. Propose, for your
   approval, a free-text role label next to the existing role list. That would be
   display-only: no new permissions and no profession-based access. It needs a small
   schema addition, so it follows the migration workflow (branch, apply, then merge).
   Do this only after the intake confirms what people want to be called.
4. **Operational check (T05)** with the operator: restore drill, a real upload of a
   cinematographer's actual file size, and the email for invitations and password
   recovery.

## 10. Recommendation

**Ready for supervised rehearsal. Not yet ready for limited real use.**

The reliability problem the audit flagged for live team conversations is fixed and
well tested. Before real work depends on OIANO, we still need:
- the rehearsal on actual phones;
- a demonstrated backup restore and a real file upload and download on the pilot
  environment;
- your choices on payments and on who starts the work.

Once those are done, a small group can start: one studio, one producer lead, two or
three contributors.

---

## Next-step plan for the initial group

### What the group can use now
- **Artists:** book studio sessions, including at other studios, and see their own
  bookings and session outputs. Attach or detach their sessions on a project.
- **Producers:** create projects, invite contributors by link, keep notes and project
  phase, and propose credits and rights.
- **Studio management:** studio-scoped bookings, staff and facilities. A manager
  working at several studios picks which one they're acting in.
- **Everyone on a project:** the project conversation, now with live updates and clear
  errors.

### What additional creatives can already do
Accept an invitation through its link and open the contribution workspace. There they
can:
- see the project's sessions and deliverables;
- take part in the conversation;
- see their verified credits and the rights record.

They can't start a project. Their role can only be recorded from a music-oriented list,
where `OTHER` is the only fit for poets, cinematographers and models. Uploading files is
limited to the artist and authorized studio admins (200 MiB per file), so a
cinematographer can't upload raw footage as a contributor today.

### Limitations that need an explicit temporary agreement
- Poets, cinematographers and models are listed as `OTHER`, with the real role in their
  display name or a note.
- Project phases are music phases (tracking, mixing, mastering). For non-music work,
  agree what each phase stands for, or ignore the phase.
- A producer starts every project.
- Large media is exchanged outside OIANO and referenced in the conversation.
- Payments happen outside OIANO unless a verified path is agreed.

### Needs that require intake before any implementation
How each discipline names its role and steps; what "done" and "accepted" mean to them;
who reviews whom; file types, sizes and versions; credit wording; usage permissions
(especially for models); scheduling needs beyond studio rooms, such as locations.

### Moving toward the reference experience (NOW, MAKE, SKY, ME)
The image shows four connected surfaces. The frozen architecture says they arrive as
migration steps, in this order:
- MAKE v1 is step 9, after Person, CreativeProfile, Discipline, Organization, Work,
  Contribution, Requirement and Agreement.
- SKY v1 is step 10.
- ME is step 21.
- NOW is step 22.

None of them starts until the stabilization gate passes. The path is:
1. Clear gate 2 (production parity).
2. Land canonical steps 1–3 (draft PRs #16 and #39).
3. Continue in order.

Meanwhile:
- Keep today's screen names; don't label anything NOW, MAKE, SKY or ME early.
- Feed intake results into the Work, Contribution and Requirement design, so MAKE serves
  real disciplines, not only music.
- Treat the image's people, balances, badges and counts as illustration. None of them
  becomes real data.
