**The creative intake round is ready to run: a questionnaire for participants, a private record that keeps what people said apart from what we propose, and a code-checked map of what OIANO supports today (T01), 2026-10-27.**

The owner wants each person to describe their own work rather than have OIANO infer it
from their profession. `docs/internal-rollout/CREATIVE_INTAKE.md` outlined the questions;
there was no method, no participant-facing version, and no reliable picture of current
support to map answers against. `docs/internal-rollout/intake/` now has the method,
questionnaire, record template, current-support map and synthesis sheet. Documentation
only; no product code, schema or architecture changed.

Current support was read from the code, not from earlier documents. Gaps found that
matter most for non-music participants, recorded in `intake/CURRENT_SUPPORT.md`:
- deliverables must belong to a studio booking;
- only a booking's artist reviews deliverables;
- only a project's artist answers a usage-consent request, so a depicted model cannot;
- contributor roles and project phases are music-only apart from OTHER;
- the profile discipline list has no writer, poet, cinematographer or model;
- contributors cannot upload files.

**Evidence:** each row of `intake/CURRENT_SUPPORT.md` names the file it was read from.
No tests apply.

**Not exercised:** no participant has answered yet.

**Observed, not changed:** the repository is public, so the method keeps every response
outside it and only anonymised patterns in `intake/SYNTHESIS.md`.
