**Partial identity reconciliation now resolves the complete connected legacy identity, canonical profile, Person, and affected User scope before writing.**

Partial runs preserve requested IDs while expanding discovered links to a fixed
point. Canonical-only profiles are retained; deleted linked identities use
pre-write data to recompute surviving names, and deleted unclaimed identities
remove only their now-orphaned Person. Empty and nonexistent scopes remain
no-ops. The public backfill interface and the separate full reconciliation path
are unchanged.

**Evidence:** The local integration suite passed all 281 tests, including
empty/nonexistent scopes, deleted linked and unclaimed Engineers, canonical-only
profile retention, and profile owner movement. API typecheck and `git diff
--check` passed. The same resolver in the PR39 port was defect-first checked
against its original implementation; linked-Engineer deletion and owner
movement assertions failed, and the repaired source was restored.

**Not exercised:** Production data or a shared database; the suite used the
checkout-local fresh integration database.
