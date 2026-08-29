# OIANO canonical communications

Communications is a coordination record attached to real work, not an
independent social network. A thread is accessible because the account has a
current relationship to its booking, project, connection, studio or support
case.

## Lifecycle

- `OPEN`: normal participant conversation.
- `WAITING_ON_USER`: the named `waiting_on_user_id` must make a formal decision.
- `RESOLVED`: the work or decision is complete; history remains readable.
- `EXPIRED`: a time-bound request elapsed without a valid decision.
- `ARCHIVED`: removed from active work without deleting evidence.

Allowed transitions are `OPEN -> WAITING_ON_USER`, `WAITING_ON_USER -> OPEN`,
either active state to `RESOLVED` or `EXPIRED`, and any non-expired state to
`ARCHIVED`. Reopening a resolved thread must create a `STATE_CHANGED` event and
record the authorised actor and reason.

## Invariants

1. A booking, project or connection has at most one canonical thread.
2. Reading or writing requires an active participant row and current resource
   authority; either condition alone is insufficient.
3. Removing a participant ends future access but never deletes past events.
4. Formal actions store their outcome in the owning domain table. The
   communication event is evidence and navigation, not the legal source of
   truth.
5. Every event-producing mutation uses an idempotency key.
6. `last_event_at` changes transactionally with an inserted event.
7. Support access requires a case relationship, reason and administrative audit
   record. Platform administrators receive no ambient access to private work.
8. Legacy message tables remain read-only during dual-read validation and are
   removed only after record counts, hashes and journey tests reconcile.

## Migration release gate

Apply `20260829120000_canonical_communications` only to a disposable Neon
branch first. Verify legacy and canonical event counts by source table, orphan
counts, duplicate participants, cross-studio denial and removed-participant
denial. Take a restorable branch snapshot before production reconciliation.
