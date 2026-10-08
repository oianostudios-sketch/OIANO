**Canonical migration, step 3 — Discipline and PersonDiscipline, 2026-10-08. On a branch
stacked on step 1–2 (`claude/identity-person-profile`, PR #16), not merged.** One person
can now hold several disciplines ("Artist · Producer · Songwriter"), mirrored from the
legacy Artist, Producer and Engineer rows the same strangler way as Person and
CreativeProfile, with no route or reader changes. `OIANO_SCHEMA_REDESIGN.md` §3.1;
`OIANO_BUILD_DIRECTION.md` stage 1.

- **Expand.** Migration `20261008120000_identity_discipline` adds `disciplines` (a reference
  list: code, label, family) and `person_disciplines` (person, discipline, `is_primary`,
  keyed on the pair, indexed by discipline), and touches no legacy table. The fourteen
  reference rows are inserted by the migration itself with `ON CONFLICT DO NOTHING`, so
  `prisma migrate deploy` gives every environment the same list. A person's links go with
  the person; a discipline anyone holds cannot be deleted.
- **Backfill and dual-write** (`lib/identity/backfill.ts`). After it mirrors persons and
  profiles, `mirrorIdentities()` gives every person it touched exactly the disciplines the
  legacy rows behind their profiles declare: an artist record is ARTIST, an engineer
  record ENGINEER, and a producer record the disciplines its holder chose
  (`Producer.disciplines`, with `primary_discipline` leading), known codes only, PRODUCER
  when none is known. The first record in naming order (artist, producer, engineer)
  supplies the primary, so an account with both is primarily an artist. It creates what
  is missing, corrects `is_primary`, and removes links no record declares. The fifteen
  existing `keepIdentityInStep()` call sites now keep disciplines in step too, with no new
  call sites: the touched persons are derived from the legacy rows they already pass,
  including a person a profile moved away from. `identityParity()` reports a missing
  discipline, one no record declares, and a wrong primary; the script prints the count.
- **Departures from the §3.1 sketch.** The reference list adds ARTIST and ENGINEER to the
  twelve codes in `apps/web/src/lib/creativeDisciplines.ts`, because the legacy Artist and
  Engineer records stand for those and the list had neither. An engineer record maps to
  the generic ENGINEER, not to recording, mix or mastering: `Engineer.specialties` is free
  text mixing genres and skills, so nothing in it clearly names a discipline. A producer
  record does not always add PRODUCER: the producer table is how every creative
  professional signs up, and a photographer who chose only PHOTOGRAPHER is not made a
  producer; PRODUCER is added only when they chose it, or as the fallback when they chose
  nothing known (`PATCH /api/producer/me` accepts any string, so unknown values exist and
  are left out). `family` is a string, as sketched, not an enum; `person_disciplines` gains
  `created_at`. The link is on Person, as specified, not on CreativeProfile.
- **Evidence.** `identity-backfill.integration.test.ts` gains four tests (13 in all) and
  `identity-dual-write.integration.test.ts` one (6 in all): an account with an artist and a
  producer row ends with one Person, two profiles and two disciplines, ARTIST primary; a
  second run changes nothing, discipline links included, row for row; parity is zero
  across the whole integration database after one run; a professional holds the
  disciplines they chose with their primary leading, an unknown value dropped and no
  PRODUCER they never chose; engineers hold ENGINEER; the reference list is exactly the
  fourteen codes; a link deleted, added and demoted behind the mirror is reported and
  repaired one each; and through the real routes, a professional who signs up as
  Songwriter and Vocalist and then changes to Producer and Songwriter holds exactly the
  new ones, with parity clean after each step. Integration 201 of 201 on a fresh database;
  API unit 106, intelligence 31, web 96, both typechecks, the build and the secret scan
  pass (one web run timed out a `ProjectDetailPage` test under load from parallel runs; it
  and the whole web suite passed on rerun). The CI drift check, `prisma migrate diff
  --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma
  --shadow-database-url <local test db> --exit-code`, reports no difference. Put back one
  at a time against the two identity files on a fresh database, each failed its intended
  test and the file was restored byte-identical (`cmp`): disciplines not mirrored by the
  writers (6 dual-write tests failed), extra links never removed, every producer made
  PRODUCER only, the chosen primary ignored, parity blind to a missing link, and
  `is_primary` rewritten on every run (the second-run test failed).
- **Before merge.** PR #16 merges first and its migration is applied in production; then
  this migration is applied there by the owner, and `prisma/backfill-identity.ts` is run
  and reports parity.
- **Not exercised.** Two writes for one person at the same moment: both may find a link
  missing; `createMany` skips the duplicate, and parity plus the next run cover anything
  else. Discipline is not yet shown or chosen anywhere through the new tables.
