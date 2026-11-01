# OIANO UI direction — audit and incremental transition

27 October 2026. Repository: `C:\projects\oiano`, branch `chore/reviewed-local-checkpoint`.

## Decision

Adopt the reference's visual language through reusable tokens and existing components, then introduce the four canonical experiences when their data and workflow prerequisites exist. The first implemented increment updates shared creator navigation, creative identity, and current-work presentation. It does not create canonical domain models or rename existing routes.

The reference was recovered from the linked conversation: `Codex Image 13 Sept 2026, 01_15_27(2).png`. Its four screens are NOW (attention), MAKE (project work), SKY (contextual discovery), ME (identity and evidence). Its strongest transferable features are near-black layered surfaces, restrained warm gold selection, cool blue discovery accents, compact sans-serif headings, rounded cards, real photography, and consistent navigation. The exact fonts and colors cannot be established from the bitmap; implemented values are design choices, not extracted specifications.

## Findings from the repository

| Finding | Evidence | Implication |
|---|---|---|
| The UI has useful shared building blocks already. | `CreatorNavigation`, `CurrentWork`, `CreativeIdentity`, `NextAction`, `ProjectWorkspaceHeader`, `ArtistAvatar`, `ArtistEmptyState`, `Modal`, `Skeleton`, `StatusBadge`. | Extend these; avoid a competing screen framework. |
| Styling is distributed across Tailwind, a 960-line global stylesheet, component CSS, inline styles, and injected style blocks. | `tailwind.config.js`, `index.css`, `CreatorNavigation.tsx`, `NextAction.tsx`, `PassportPage.tsx`. | Introduce opt-in semantic tokens; migrating everything at once would have a wide regression surface. |
| Existing surface definitions disagree. | Tailwind `studio.surface` is `#141414`; root `--surface` is `#111111`. | Keep legacy values intact and establish one source for newly migrated components. |
| Global typography applies serif display styling to headings. | Global `h1`–`h4` and `font-display` selectors use Playfair Display. | Scope compact sans-serif headings to migrated components instead of changing all operational screens. |
| Navigation is role-aware and has meaningful deep links. | `creatorNavigation.ts` uses longest-prefix matching; producer Passport is distinct from Projects. `MobileBottomNav` serves studio operators. | Preserve route selection, all seven creator destinations, and operator navigation. |
| Current work already handles loading, errors, stale data, empty results, and encoded project links. | `CurrentWork.tsx`, `CreativeJourney.test.ts`. | Restyle without recreating data fetching or inventing projects. |
| The attention component has a real decision source. | `NextAction` reads `/context` and preserves decision-specific links. | Use this as the starting point for NOW; do not replace it with a decorative notification feed. |
| Discovery is not yet canonical SKY. | `DiscoverPage` reads `/artists/discover`, filters creative-DNA attributes, and gates artist connection actions. | A visual constellation must not imply requirement matching, availability, or verified relationships the source does not provide. |
| Project stages are current production phases. | `ProjectWorkspaceHeader` displays six actual phases and explicitly distinguishes phase from completion score. | Do not substitute the reference's Beat/Vocals/Mix/Master stages or fabricate percentage completion. |
| Passport combines several existing reads. | `PassportPage` reads `/passport/portfolio`, `/bookings`, `/passport/analytics`. | Preserve privacy and evidence provenance; counts and badges must come from real records. |
| Canonical migration is still gated. | `AGENTS.md`, `OIANO_FROZEN_ARCHITECTURE.md`, current checkpoint in `OIANO_STABILIZATION_GATE.md`. | A visual foundation can ship independently; the reference does not justify skipping domain migration prerequisites. |

## Token system

Implemented source: `apps/web/src/styles/experience-tokens.css`. Tailwind exposes the same color variables as `experience-*` utilities with opacity support. Tokens are additive and have no effect on legacy consumers until used.

| Category | Tokens / values | Intended use |
|---|---|---|
| Surfaces | canvas `#080B0D`, surface `#111518`, raised `#191E22` | Page, cards, nested or selected surfaces |
| Borders | `#333B40` | Quiet structural separation; interactive selection also gets a stronger gold border |
| Text | primary `#F5F4F0`, secondary `#B8C1C8` | Main content and readable supporting information |
| Accents | gold `#F2D08C`, blue `#8FC5EE`, error `#F0C4BD` | Selection and actions, discovery/focus, error copy |
| Surface aliases | NOW/MAKE/ME → gold; SKY → blue | Future experience themes, not new API fields |
| Typography | existing DM Sans stack | Scoped compact headings and UI text; retain existing font loading and fallback |
| Spacing | 4, 8, 12, 16, 24 px | A shared rhythm for new and migrated components |
| Shape | card 16 px; control 10 px | Layered cards and consistent navigation controls |
| Interaction | 44 px minimum target; 160 ms transition; 0 ms for reduced motion | Touch usability and motion preferences |
| Elevation | soft 12/32 px black shadow | Modest separation, avoiding a glowing border on every card |

Do not use accent colors as the sole indicator of state. Keep `aria-current`, explicit status text, loading/error distinctions, keyboard focus, and existing reduced-motion handling. Existing global focus styling still governs the app. Some older CreativeJourney control colors remain candidates for the next token pass.

## Four-experience component map

| Surface | User question | Reuse now | Later composition and prerequisite |
|---|---|---|---|
| NOW | What needs me? | `NextAction`, `CurrentWork`, `NotificationBell`, existing dashboard reads | Prioritized decision card, next session, compact attention rows. Canonical NOW remains a projection of verified domain state. |
| MAKE | What am I creating? | `ProjectWorkspaceHeader`, `ProjectActionPanel`, `MessageThread`, `ContributionContext`, existing files and sessions | A work shell with decisions, people, sessions, files and agreements. Requires canonical Work, Contribution, Requirement and Agreement before MAKE v1. |
| SKY | What does my work need? | `SearchInput`, `ArtistAvatar`, `ArtistEmptyState`, existing discovery lists | Search/filter chips, people/place/service results. Add a constellation as an optional view with a keyboard-accessible list, only after real requirement-linked discovery exists. |
| ME | What is my career becoming? | `CreativeIdentity`, `ArtistPassportCard`, `ReleaseArtwork`, `TrustSignal`, profile drawer | Portfolio tiles, contribution/evidence rows and relationships. Verification must reflect provenance and permissions; do not infer it from profile completeness. |

Extract shared `SurfaceCard`, `SectionHeading`, `ActionRow`, `FilterChip` and `EvidenceRow` only when a second real use establishes a stable shared interface. Presentation components should receive data and callbacks; API reads remain in existing hooks/containers through `lib/api.ts`. Reuse existing modals and focus behavior rather than creating a parallel overlay implementation.

## Implemented first increment

The [30 October discovery/network follow-up](status/2026-10-30-discovery-network-context.md)
separates participant descriptions, one recorded work context and private
invitations. It removes score-like discovery presentation, not the existing
server selection, and does not implement a public graph or opportunity board.

The [30 October Home audit](status/2026-10-30-home-audit-redirection.md) makes
professional Home distinct from Projects, keeps artist network/profile detail
optional, surfaces contribution invitations and preserves role-correct project
links. It changes no route addresses or authorization contracts.

- Added the experience token stylesheet and loaded it once in `main.tsx`.
- Added Tailwind semantic color aliases without replacing legacy `gold`, `dome` or `studio` colors.
- Moved creator navigation's injected styles into `CreatorNavigation.css`, adopting tokenized colors, spacing, control shape, selected borders, and 44 px touch targets.
- Applied tokenized surfaces and text to `CreativeJourney.css`; scoped sans-serif identity and section headings to these components.
- Kept navigation labels, route destinations, auth handling, data reads, mutations and cache keys intact.

The [29 October entry and current-work follow-up](status/2026-10-29-creative-network-entry-current-work.md) extends Home's current-work read to accepted contributions using the existing inbox cache. It adds direct accepted-workspace links and clearer creative-network entry copy without changing signup roles or introducing canonical models.

This increment visibly affects shared artist/producer navigation and the artist identity/current-work components already used by Dashboard and Passport. It does not reproduce all four reference screens. It adds no dependency, server endpoint, database migration, or financial change.

## Migration sequence and acceptance

1. **Foundation (implemented):** additive tokens and first shared components. Acceptance: web typecheck, regression suite and build; narrow/wide layout checks.
2. **Attention and project visuals (in progress):** `NextAction`, current/upcoming work, project header and phase path, and project file rows now use the shared language. Session rows remain. Preserve server-supplied action links, current phases, query invalidation, private file-ticket access, and loading/error/retry behavior. Test real action routing and unknown/empty states.
3. **Discovery and passport visuals (in progress):** discovery search/filter controls and results have responsive token-based styling; Passport remains. Migrate portfolio/evidence presentation next. Check artist/producer differences, privacy, long names, missing images and keyboard interaction. Retain list navigation even if a network visualization is added later.
4. **Canonical experience rollout:** follow the repository's frozen domain migration order and stabilization gate. MAKE v1 precedes SKY v1; ME follows evidence/Weave; NOW follows ME. Map the four destinations only when their underlying experiences are present. Keep legacy deep links and a clear home for Contributions, Messages and Account.
5. **Retire duplicates:** remove an old style/component only after its consumers have migrated and its regression checks pass. A presentation-only change should not force an API contract change.

Progress recorded 29 October 2026: project workspace hero, phase path, navigation, selected-project accents and file rows now consume the shared tokens. The existing production phase, decision and private-file access semantics remain unchanged. See the [project workspace](status/2026-10-29-project-workspace-visuals.md) and [file-row](status/2026-10-29-project-file-rows.md) records for validation.

For each increment, capture loaded/empty/error views at mobile and desktop widths, test keyboard focus and reduced motion, and run the relevant existing behavioral tests. Full signed-in acceptance should cover project opening, contribution invitations, message sending, booking/availability updates, and passport privacy using the repository's isolated local environment. Payment/settlement behavior needs its existing integration coverage if subsequently touched.

## Validation and limits

- Web typecheck: passed.
- Existing web suite: 212 tests passed across 26 files.
- Web production build: passed (2,044 modules transformed).
- Isolated browser component renders: inspected at 390 and 1,440 px. All seven creator links were present, all navigation targets measured 44 px tall, and document width matched the viewport.
- Screenshots use actual components rendered with sample data, existing CSS, and fallback fonts. They are component-layout evidence, not authenticated end-to-end screenshots. The isolated fixture omits the full application shell and compiled Tailwind reset; its runner emitted expected SSR layout-effect and fixture Tailwind configuration warnings. The actual web build passed.
- API tests, database integration, live backend workflows, font-loading fidelity and production deployment were not exercised for this CSS-focused increment.
- No new behavioral tests were added for this presentation-only change; existing route/current-work regressions supplied the behavioral coverage.

## Rollback and ownership

To reverse this increment, restore only the four modified implementation files (`main.tsx`, `tailwind.config.js`, `CreatorNavigation.tsx`, `CreativeJourney.css`) from the pre-change state, and remove the two new stylesheets. Retain audit/status records. Do not reset the entire shared checkout. No data rollback is required.

Pre-existing changes in `docs/README.md`, `.vscode/`, the canonical reconciliation document, and rollout screenshots were left untouched. Changes are local and uncommitted; nothing was pushed or deployed.
