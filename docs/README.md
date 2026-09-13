# OIANO documents

Start with [`AGENTS.md`](../AGENTS.md). This page says which documents are current, so
nobody works from an expired brief.

## Current

| Document | Use it for |
|---|---|
| [OIANO_FROZEN_ARCHITECTURE.md](OIANO_FROZEN_ARCHITECTURE.md) | The target system: laws, owner decisions, migration order and the Golden Journey. Changing it is an owner decision. |
| [OIANO_IMPLEMENTATION_STATUS.md](OIANO_IMPLEMENTATION_STATUS.md) | What has landed, with evidence, and what is still open. |
| [OIANO_STABILIZATION_GATE.md](OIANO_STABILIZATION_GATE.md) | Whether the canonical migration may start, and what blocks it. |
| [OIANO_SCHEMA_REDESIGN.md](OIANO_SCHEMA_REDESIGN.md) | The designed canonical schema, step by step. |
| [OIANO_ARCHITECTURE_DELTA.md](OIANO_ARCHITECTURE_DELTA.md) | How today's models map to the target, with contradictions and migration risks. |
| [ARCHITECTURE_AUDIT_2026_09_06.md](ARCHITECTURE_AUDIT_2026_09_06.md) | Findings A01–A11. Check implementation status before reopening one. |
| [OIANO_EXPERIENCE_MISMATCH_2026_09_13.md](OIANO_EXPERIENCE_MISMATCH_2026_09_13.md) | Where today's screens contradict the target, and what may change before the migration. |
| [OIANO_DIRECTION.md](OIANO_DIRECTION.md) | Who owns which truth, how projections rebuild, how work is verified. Its §1 and §8 are history. |

## Reference: check against the code

Written before the frozen architecture. They describe plans or mechanisms that still
exist, so confirm a claim in the code before relying on it.

| Document | Covers |
|---|---|
| [OIANO_MARKET_ADOPTION_CONTINUATION_AUDIT.md](OIANO_MARKET_ADOPTION_CONTINUATION_AUDIT.md) and [OIANO_ACTION_GUIDE.md](OIANO_ACTION_GUIDE.md) | The product and adoption plan. Stage 1 is done; later stages wait behind the migration. |
| [PERMISSION_ARCHITECTURE.md](PERMISSION_ARCHITECTURE.md) | Permissions |
| [COMMUNICATION_ARCHITECTURE.md](COMMUNICATION_ARCHITECTURE.md) | Communications |
| [OIANO_PAYMENTS.md](OIANO_PAYMENTS.md) | Payments, written before the owner's currency decision |
| [DATABASE_BASELINE.md](DATABASE_BASELINE.md) | The database baseline |
| [STUDIO_OPERATING_MODEL.md](STUDIO_OPERATING_MODEL.md) | Studio operations |
| [OIANO_ENVIRONMENT_AUDIT.md](OIANO_ENVIRONMENT_AUDIT.md) | Display and environment findings. Read its Corrections section first. |

## History

Kept for the record. Not instructions.

- In this folder: OIANO_BUILD_GUIDE, OIANO_COMPLETION_BRIEF, OIANO_EXPERIENCE_AUDIT,
  OIANO_SYSTEM_AUDIT, PRODUCTION_RELEASE_AUDIT, RELEASE_CHECKPOINT, ROLE_QA_MATRIX and
  TEST_READY_V1_AUDIT.
- At the repository root: CLAUDE_CODE_PROMPT, CURRENT_ARCHITECTURE, FULL_SYSTEM_AUDIT,
  INTELLIGENCE_LAYER_STAGE1_AUDIT, OIANO_ARTIST_PROMPT, OIANO_DEV_PROMPT,
  OIANO_PRODUCER_PROMPT, OIANO_PRODUCT_PROMPT, OIANO_System_Overview and
  SCALE_READINESS_ROADMAP. Code comments still cite the scale readiness roadmap by tier.
