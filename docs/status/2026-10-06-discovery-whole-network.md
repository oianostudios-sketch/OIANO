**Discovery ranks every artist on the network, 2026-10-06 — C39.** `GET /api/artists/discover`
loaded the first 50 artists the database returned, in no order, and ranked only those. Once
the network passed 50 artists, most of them could never be discovered, however well they
matched; which 50 were seen was an accident of storage.

- **What changed.** The ranking now runs in Postgres over every artist with a passport,
  and returns the top 20. The score is unchanged: shared genres count 3, shared themes 2,
  a complementary vocal role 1. Ties go to completed sessions, as decided for C18, and then
  to the artist id, so the order is stable. A genre or theme list stored as something other
  than an array counts as empty instead of failing. The response is the same shape.
- **Removed.** `lib/discoveryRanking.ts` and its two unit tests: the comparator only sorted
  the 50 rows, and the integration test below now holds both rules it covered.
- **Evidence.** `discovery-network.integration.test.ts` creates 60 artists who share nothing
  with the caller before the ones who do. The best match, created last, ranks first with
  its overlap and shared theme; of two equal matches, the one with completed sessions ranks
  above a fuller profile; the caller never appears; malformed profile data does not break
  the query. With `main`'s first-50 route the best match is not found and the tie test fails;
  with completeness as the tie-break the tie test fails. Integration 119 of 119 on a fresh
  database; API unit 100 (the two removed tests), intelligence 31, web 85, both typechecks,
  the build and the secret scan pass.
- **Not exercised.** Query time on a large network: the score is computed for every artist
  on each request, which is fine at today's size and wants an index or a precomputed field
  long before it matters. Discover in a browser.
- **Also fixed: a timing flake.** This change's first CI run failed in
  `weave-invitations.integration.test.ts`, untouched here: its A08 fixture edits one booking
  right after writing another and asserts the edit is later, and on a fast machine both
  writes can share a millisecond. The edit is now stamped a minute later; the test passed
  three runs in a row locally.
