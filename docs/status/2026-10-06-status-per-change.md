**Changes no longer conflict in shared files, 2026-10-06.** Every pull request appended
to `docs/OIANO_IMPLEMENTATION_STATUS.md` at the same place and added its test file to
the same list in `scripts/run-api-integration-tests.js`, so each merge left the others in
conflict. Resolving those conflicts took hours in the week of 2026-09-30, and one
resolution duplicated hundreds of lines of the status document. With the owner's approval
to merge green changes automatically and to work on several in parallel, those two shared
files would have conflicted on every merge.

- **Status records.** Each change now records itself in its own file under
  [`docs/status/`](README.md). The history file is kept as it is and no longer appended to.
  `AGENTS.md` says so.
- **Integration runner.** Every `*.integration.test.ts` file in `apps/api/src/integration`
  runs, so a new test file needs no edit to the runner. The order is unchanged: Node's test
  runner orders the files by name itself, so the hand-kept list never decided it.
- **Evidence.** The runner found exactly the fifteen files it used to list, and the
  integration suite runs the same 114 tests, in the same name order, as before. Both typechecks, the
  API unit, intelligence and web suites, the build and the secret scan pass.
