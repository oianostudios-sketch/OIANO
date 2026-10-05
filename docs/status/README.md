# Status records

One file per change that lands, so that changes made in parallel never edit the same
file. [`OIANO_IMPLEMENTATION_STATUS.md`](../OIANO_IMPLEMENTATION_STATUS.md) holds every
record up to 2026-10-06 and is no longer appended to; check both before reopening a
finding.

## Adding a record

Name the file `YYYY-MM-DD-short-slug.md`, dated the day the change is opened, and write it
in the same form the history uses:

- a bold first line that says what is now true, with the finding ids it closes;
- what was wrong, and what changed;
- **Evidence**: the tests, the verify table, and every defect put back to prove a test
  catches it;
- **Not exercised** and **Observed, not changed**, when there are any.

A record is never deleted. When a later change supersedes it, the later record says so and
links back; the earlier file may gain a one-line note pointing forward.
