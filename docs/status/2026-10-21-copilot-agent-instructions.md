**GitHub Copilot Agent mode now follows the shared OIANO project guidance.**

The former Claude prompt contained stale single-studio and Dreamz Music Lab
assumptions. It has been reduced to a historical notice pointing agents to
`AGENTS.md`. Added `.github/copilot-instructions.md` as Copilot's repository-wide
instruction entry point; it defers project facts and safety rules to `AGENTS.md`
and points agents to the current architecture and documentation index.

**Evidence**: Reviewed `AGENTS.md`, the legacy prompt, and `docs/README.md`.
This is documentation-only; no tests or builds were run.

**Not exercised**: Copilot Agent mode behavior in VS Code.
