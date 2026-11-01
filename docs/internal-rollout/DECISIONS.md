# Decisions and open questions

## Confirmed by the owner, 2026-10-27

- Name: OIANO, Optimized Intelligence for Advanced Network Output.
- Start with people already working together, including artists using their own and other studios, producers and studio management.
- Add other creatives to work as needed: poets, cinematographers, models and other friends. Initial context mentions two cinematographers and three or four producers; artist count and total remain unspecified.
- Ask people for their actual work primitives instead of letting the system assume their work from profession alone.
- Preserve continuity between Codex and Claude Code through repository documentation.
- Apply the proposed audit. Its initial scope excludes product changes and deployment.
- Later the same day: implement T02 and T03 with local T04 verification, and report
  a bounded next-step plan. No deploy, push, merge, production data change,
  payments, canonical migration or frozen-architecture change.
- Each person's own description of their work is the source; record what they told
  us, what OIANO supports, what we propose and what they confirmed separately.
- The four-surface reference image (NOW, MAKE, SKY, ME) is a target experience, not
  evidence of existing features; its music examples do not limit who OIANO serves.

## Existing repository direction

The frozen architecture controls migration order, identity and contribution semantics. The reference image illustrates NOW, MAKE, SKY and ME as intended surfaces. It does not authorize bypassing the migration gates or prove that those surfaces exist today. The owner's broader expansion of the OIANO name does not by itself replace the Creative Work Network product description.

## Proposals, not approved decisions

- First run a supervised studio-centered pilot with legitimate producer project leads.
- Fix IR-01 and IR-02 before relying on conversations.
- Admit additional disciplines through truthful agreed contribution descriptions; use intake to design compatible changes.
- Keep payments outside the first acceptance journey only if the owner confirms their actual work permits that. Do not assume paid booking works with Stripe off.
- Review existing feedback daily in the first week and expand after successful real workflows.

## Implementation choices in batch 1 (2026-10-27), reversible by the owner

These were made to implement T02 within the existing access policy. None widens who
can read a conversation.

- **Live delivery follows read access.** Everyone who can read a project
  conversation through their part in the work hears new messages live: artist,
  producer, contributors whose contribution is ACTIVE, engineers (role ENGINEER)
  assigned to its bookings, and STUDIO_ADMINs holding a membership at a studio it was
  booked at. Staff and engineers could already read; they previously received no live
  event. If studio management finds this noisy, narrowing delivery is a one-line
  change in `conversationMembers`, and read access stays as it is.
- **Platform operators (OIANO_ADMIN) are not sent messages live.** They keep their
  existing oversight read access but are not members of the work.
- **Invited (including claimed-but-unanswered), declined, correction-requested and
  removed contributors** neither read nor hear the conversation; this was already the
  read policy.
- **One event per person** however many ways they qualify.

## Open

Exact group size, first actual project/session, intended deployed environment, whether payments must move, recovery owner, and whether artist/poet self-initiation is needed on day one. These do not prevent source auditing; they affect pilot acceptance and implementation scope.
