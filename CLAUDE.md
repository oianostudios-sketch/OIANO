@AGENTS.md

## Notes for Claude Code

- `AGENTS.md` above is the shared guide for every agent. Keep project facts and rules
  there, not here, so Claude and Codex never work from different versions.
- For a browser preview, start `oiano-local` from `.claude/launch.json`. `oiano-dev`
  runs against whatever database `.env` names, which is shared.
- The Bash tool in this Windows checkout is Git Bash, and backslashes inside heredocs
  do not survive it. Write any script that needs them to a file first.
