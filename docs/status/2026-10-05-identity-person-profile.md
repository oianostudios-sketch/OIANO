**Canonical migration, steps 1 and 2 — Person and CreativeProfile, 2026-10-05. On a branch,
not merged: it waits for stabilization gate 2.** Owner decision of 2026-10-05 to start the
Identity migration now. Built to the first slice in `OIANO_SCHEMA_REDESIGN.md` §7, with no
route changes.

- **Expand.** Migration `20261005120000_identity_person_profile` adds `persons` and
  `creative_profiles` and two enums, and touches no legacy table. Deleting a user keeps
  their Person with `user_id` cleared; a Person with profiles cannot be deleted.
- **Backfill** (`lib/identity/backfill.ts`, run by `prisma/backfill-identity.ts`). One Person
  per User, named from the user's artist, producer or engineer record in that order, never
  from the email address. One CreativeProfile per Artist, Producer and Engineer row under
  the same id, with a unique handle from the name the person chose; an artist's
  unpublished location stays private. An engineer without a login gets a Person with no
  `user_id`. It only creates what is missing, so a second run changes nothing and nothing
  written later is overwritten. An id found in two legacy tables stops it before it writes.
- **Verify.** `identityParity()` (`--verify` writes nothing) lists every User without a
  Person, every legacy identity without its profile or under the wrong person, every
  ARTIST WeaveNode naming no profile, and profiles whose legacy row is gone.
- **Departures from the §3.1 sketch.** `Person.display_name` is nullable: a studio operator
  has no record that names them, and the rule forbids taking it from an email.
  `CreativeProfile.legacy_source` records which legacy table a profile mirrors while
  legacy readers remain. `Person.active_organization_id` waits for step 4's Organization.
  Discipline and PersonDiscipline are step 3.
- **Evidence.** `identity-backfill.integration.test.ts`, nine tests, backfills the whole
  integration database, every other file's accounts included, and finds zero mismatches; a
  second run changes nothing, row for row; one account with an artist and a producer record
  ends with one Person and two profiles; operators get no name; a listed engineer is an
  unclaimed identity; namesakes get distinct handles; an identity created after the
  backfill is reported and resolved by the next run; an id collision writes nothing.
  Integration 114 of 114 on a fresh database; API unit 102, intelligence 31, web 85, both
  typechecks, the build and the secret scan pass. Put back one at a time, each failed its
  intended test and the file was restored byte-identical: persons re-created, profiles
  re-created, the producer record named first, an email as a name, no collision check, a
  private location published, no handle suffix, and parity blind to a User without a
  Person. The migration adds no drift: `prisma migrate diff` from the migrations to the
  schema prints the same 43 lines on `main` and on this branch, all of them gate 2. On a
  freshly seeded database the script found 12 unresolved identities, created 9 persons and
  7 profiles, then reported parity, and a second run created nothing.
- **Before merge.** Gate 2 passes; the migration is applied to production; the script is
  run there and reports parity.
- **Dual-write, 2026-10-05, same branch.** Reading Person and CreativeProfile is only safe
  if they stay current, and the first version of the backfill only created missing rows, so
  an artist's later edits would never have reached them. While the legacy rows remain the
  truth, the canonical rows now mirror them: `mirrorIdentities()` creates what is missing,
  updates mirrored fields that differ (the handle is kept once chosen), and removes a
  profile whose legacy row is gone, with its unclaimed person. The backfill is that mirror
  over everything, and still changes nothing on a second run. Fifteen writers call
  `keepIdentityInStep()` after they save: the four signup paths, studio registration and
  walk-in guests, a producer's setup, edits and avatar, an artist's profile, portfolio,
  avatar and status, and a studio's engineer list. A failed mirror is logged and does not
  fail the request; parity reports it and the next run repairs it. Parity now compares
  every mirrored field and each person's name, not only that rows exist.
- **Evidence, dual-write.** `identity-dual-write.integration.test.ts`, five tests, starts from
  a database in step and drives the real routes, checking parity after each edit with no
  backfill run in between: four kinds of signup, three artist edits, producer edits, an
  engineer listed, renamed and removed, and a change made behind the routes reported and
  repaired. Integration 124 of 124 on a fresh database; API unit 102, intelligence 31, web
  85, both typechecks, the build and the secret scan pass. Put back one at a time, each
  failed its intended test: no mirror after signup, after a profile edit, after a producer
  edit or after an engineer is removed, and parity blind to field differences. The
  profile-edit mutation first survived, because a later edit in the same test mirrored the
  artist again; the test now checks parity after each edit.
- **Observed, not changed.** Signup names an artist from the email address when no name is
  given (`auth.controller.ts`), so that artist's Person carries it; the rule against
  email-derived names holds only for what the backfill itself chooses. A studio admin can
  never delete an artist: `DELETE /api/artists/:id` finds only artists who booked the
  studio, then refuses any artist with a booking.
