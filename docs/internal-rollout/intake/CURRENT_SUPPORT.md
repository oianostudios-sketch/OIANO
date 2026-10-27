# What OIANO supports today, per work primitive

For whoever maps intake answers. Checked against the code on 2026-10-27 at
`claude/conversation-reliability`; re-check before relying on a row. "Today" means the
running system, not the frozen target. The target column names the canonical concept
and its migration step in `docs/OIANO_FROZEN_ARCHITECTURE.md`, which nothing here may
skip ahead of.

| Primitive | Today | Who can act | Gap for non-music work | Target concept (step) |
|---|---|---|---|---|
| **Work** | `Project`: title, notes, `phase` from PRE_PRODUCTION, TRACKING, EDITING, MIXING, MASTERING, DELIVERED (`producer.routes.ts`) | Only a PRODUCER creates it and changes phase | Phases are music stages; no kind of work (shoot, poem, campaign) | Work with `kind` and discipline-specific `phase`, startable by anyone (5) |
| **Brief / inputs** | Project `notes`, free text written by the producer. The "artist brief" in `artists.routes.ts` is an AI profile summary, not a work brief | Producer | No structured inputs, references or requirements | Requirement (7) |
| **Contribution** | `ProjectParticipant` with `role` from a music list plus MANAGER and OTHER; invited by a single-use link; INVITED → ACTIVE, DECLINED or CORRECTION_REQUESTED; producer can remove | Producer invites and removes; the invited person answers | Poet, cinematographer, model, stylist etc. are all `OTHER`; no per-work responsibilities | Contribution with its own role and discipline (6) |
| **Discipline (what a person says they do)** | Profile picker in `apps/web/src/lib/creativeDisciplines.ts`: 12 options. Visual ones are Creative director, Photographer, Videographer. No writer, poet, cinematographer or model | The person | Missing disciplines | Discipline / PersonDiscipline (3) |
| **Steps and handoffs** | None beyond the project phase | — | No tasks, sequence or handoff | Not a frozen primitive; would come from WorkEvent, Deliverable and Version (13–15). Intake should establish whether it is needed |
| **Appointment** | `Booking` of a studio `Room` with a `ServiceOffering` | Artist books; studio staff manage | No locations, shoots off-site, rehearsals or remote sessions without a studio | WorkEvent: SHOOT, REHEARSAL, REMOTE_SESSION (13), booking bridge (12) |
| **Resource** | Studio rooms and `Equipment`; studio-assigned engineers | Studio staff | No personal kit, locations, props, wardrobe | Organization spaces and offerings (4); Requirement SPACE / SERVICE (7) |
| **Deliverable / version** | `Deliverable` + `DeliverableVersion`, **required to belong to a booking** | Studio staff deliver files for a booking (`bookings.controller.ts` `deliverSessionFiles`) | Work produced outside a booked studio session cannot be delivered at all; contributors cannot submit | Deliverable re-parented to Work, booking optional (14, 15) |
| **Review / acceptance** | `DeliverableReview`: the booking's ARTIST approves or requests changes (`bookings.routes.ts`) | Booking artist only | A producer, director or client cannot be the reviewer; contributors cannot review each other | Review on Deliverable (14); Evidence APPROVED_DELIVERABLE (19) |
| **Files** | `ArtistFile`, owned by an artist, 200 MiB per upload (`files.routes.ts`); project files matched by folder name | Artist or authorized studio admin | Contributors cannot upload; raw footage likely exceeds the limit | Asset owned by a Person, linked to Work (14) |
| **Credit** | `ProjectCredit`: name, role (music list + OTHER), DRAFT until the credited participant confirms; public only after their own confirmation | Producer proposes; the credited contributor confirms (`contributions.routes.ts`) | Role vocabulary only | Credit tied to Contribution (18) |
| **Rights / terms** | `RightsAgreement` MASTER or PUBLISHING with percentage shares; holders may be contributors, who decide | Producer proposes; holders decide | No contribution terms, licence, buy-out, image rights or fee terms | Agreement kinds incl. CONTRIBUTION_TERMS, SERVICE_TERMS (8) |
| **Usage permission** | `PromotionalConsent`: subject, purpose, channels (Instagram, TikTok, YouTube, website, press, paid ads, email), assets, expiry | Producer requests; **only the project's artist** responds (`artist-projects.routes.ts`) | A model or other person depicted cannot give or withdraw their own consent | Agreement PROMOTIONAL_CONSENT with parties (8) |
| **Payment** | Studio booking payments, wallet and ledger; Stripe disabled in the checked-in deploy config | Artist pays a studio | No contributor fees, day rates or invoices between people | Economic Obligation and Settlement (16, 17) |
| **Privacy / leaving** | Removing a contributor ends their access; conversation and workspace limited to members | Producer | — | Contribution REMOVED / WITHDRAWN (6) |
| **Conversation** | Project conversation for every member, live (fixed in batch 1) | Every member | — | Unchanged |
| **Reminders** | Notifications for invitations, credits, rights, bookings | System | No reminders the person defines | NOW (22) |
| **Evidence / record** | Weave evidence from completed sessions and confirmed credits | System | Only studio sessions and credits count | Evidence (19), ME (21) |

## What this means for mapping

- When someone describes something in the "Gap" column, record it as a gap. Do not
  describe a workaround as support.
- A temporary agreement (for example "your role shows as Other", "send the cut by
  link in the conversation") is an explicit choice the person accepts, recorded in
  their record. It is not support.
- Many gaps are already designed in the frozen target. The intake's job is to confirm
  what each discipline actually needs from those concepts, not to invent new ones.
