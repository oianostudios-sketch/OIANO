**A studio cannot delete an artist, 2026-10-06.** `DELETE /api/artists/:id` let a studio
admin delete an artist's account, user row included, and could never succeed: it found only
artists who had booked that studio, then refused any artist with a booking, so every
request ended in a 404 or a 409. The dashboard offered a Delete button on every row of the
roster that always failed. Found while building the Identity dual-write (2026-10-05).

- **Removed, not repaired.** Making the route work would let a studio remove a person from
  the network, and AGENTS.md says identity is issued by OIANO, never by a studio. The route,
  the dashboard's Delete button and its mutation are gone; a comment in
  `routes/artists.routes.ts` says why. Removing an account belongs to the person or a
  platform operator, and arrives with the Identity migration.
- **Evidence.** `artist-identity-ownership.integration.test.ts`: a studio admin's
  `DELETE /api/artists/:id`, for an artist who booked the studio and for one who never did,
  answers 404 and leaves the artist and their account in place. With `main`'s route put
  back the test fails, the booked artist answering 409. Integration 115 of 115 on a fresh
  database; API unit 102, intelligence 31, web 85, both typechecks, the build and the secret
  scan pass.
- **Not exercised.** The dashboard in a browser.
