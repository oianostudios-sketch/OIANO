**Partial identity reconciliation now resolves the complete connected legacy identity, canonical profile, Person, and affected User scope before writing.**

Partial runs preserve requested IDs while expanding discovered links to a fixed
point. Canonical-only profiles are retained; deleted linked identities use
pre-write data to recompute surviving names, and deleted unclaimed identities
remove only their now-orphaned Person. Discipline mirroring continues to cover
both prior and current owners, including linked Persons with no surviving
profiles. The public backfill interface and separate full reconciliation path
are unchanged.

**Evidence:** The local integration suite passed all 286 tests, including
empty/nonexistent scopes, deleted linked and unclaimed Engineers, canonical-only
profile retention, owner movement, and discipline cleanup for prior and current
owners. API typecheck and `git diff --check` passed. With the original backfill
implementation temporarily restored, the linked-Engineer deletion and
owner-movement regression assertions failed; the repaired implementation was
restored afterward.

**Not exercised:** Production data or a shared database; the suite used the
checkout-local fresh integration database.
