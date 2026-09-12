# OIANO — Market Value, Adoption and Retention Continuation Audit

Date: 2026-09-07. Repository HEAD: `b66b1c276f0169d7a2a6058c1091e5d8b62a3838`.

Continuation of [Environment Display & Global Experience Audit](OIANO_ENVIRONMENT_AUDIT.md) and [Seamless Experience Audit](OIANO_EXPERIENCE_AUDIT.md), governed by [OIANO Direction](OIANO_DIRECTION.md). This is an audit and proposed implementation specification. No application code was modified.

**Decision:** OIANO has credible operational foundations and a distinctive evidence proposition, but it is not yet a dependable adoption loop. Prioritize truthful state, continuity after actions, and contextual entry into real work. Prove the visual system on four surfaces before expanding it. More decoration will not resolve the current gaps.

## Evidence, continuity and limits

Evidence labels used below: **S** = directly inspected source; **H** = historical audit finding retained with its original scope; **I** = interpretation or hypothesis; **T** = proposed target, not observed behavior. Source paths are relative to this document. Scores are expert judgments, not customer satisfaction data or measured conversion rates.

The user's report of green CI is accepted as continuity evidence. CI was not independently rerun or verified in this audit. No production payments, invitations, uploads or messages were sent. No live browser failure injection, rendered accessibility audit, performance profiling or participant testing was performed. Consequently, time-to-value, willingness to pay, retention and actual viewport failures remain unmeasured. The failure matrix is source inspection plus a reproducible runtime test specification, not a claim those runtime tests passed.

The shared working tree initially contained changes in `sessionLog.ts`, `files.routes.ts`, an integration runner, a new architecture integration test and an architecture audit. They were left untouched. Upload conclusions below concern the inspected frontend flow, not certification of the concurrently edited API.

### Corrections to the earlier audits

| Prior finding | Current evidence and disposition |
|---|---|
| 72 token references against 2,094 raw hex literals | Historical baseline retained. Current TSX scan: **155 token references and 2,094 hex literals**, with **332 exact six-digit colors and 213 singletons**. Definitions and reproducibility are in L. |
| Creator guidance absent | **Resolved in part:** `creatorContext.ts` ranks deterministic next actions; Artist Home consumes context and renders `NextAction`. Coverage, freshness and action specificity remain incomplete. |
| Confirmed future sessions count as completed evidence | **Corrected:** `verifiedWork.ts` defines performed work as `COMPLETED`; Passport and context use it. Do not reopen this as an unfixed defect. |
| Invitation infrastructure absent | **Backend exists:** hashed token, expiry, conditional single-use claim and inviter listing. **No creator invitation consumer was found in the frontend.** Infrastructure is not yet a usable adoption flow. |
| Events artist-only and unversioned | **Corrected structurally:** subject type/id, actor and version now exist; the event union includes studio registration, payout and invitation acceptance. Full creative-work lifecycle coverage is still incomplete. |
| Identity exists only at entry; no print or global focus | Current source includes `OianoBrand` on Public Passport and Receipt, Public Passport print CSS and a global focus-visible rule. Assess these implementations; do not report them as absent. |
| Workrooms and notifications are separate destinations | `/workrooms` and `/notifications` now redirect to Communications. Audit the routed `CommunicationsPage`, not only the older unmounted pages. |
| Onboarding drops artists on Dashboard | Default completion and ordinary artist login currently go to **Calendar**. This bypasses the newly improved Home unless a return path is supplied. |

### Primary repository evidence register

| ID | Source and observation |
|---|---|
| E1 | [creatorContext.ts](../apps/api/src/lib/creatorContext.ts): ranking, `starts_at >= now`, artist-specific work queries, aggregate progress, generic rights destination, no invitation or since-last-visit field. |
| E2 | [NextAction.tsx](../apps/web/src/components/NextAction.tsx), [DashboardPage.tsx](../apps/web/src/pages/DashboardPage.tsx): shared context query; generic “Open”; silent missing/error state; counts and next session now server-derived. |
| E3 | [invitations.routes.ts](../apps/api/src/routes/invitations.routes.ts), [schema](../prisma/schema.prisma): creator invite records attribution; no project/studio membership field; token acceptance does not compare recipient email. |
| E4 | [EnterPage.tsx](../apps/web/src/pages/EnterPage.tsx), [OnboardingSequencePage.tsx](../apps/web/src/pages/OnboardingSequencePage.tsx): `next` consumed, `invite` not consumed; four onboarding steps; default Calendar return; 850ms post-auth transition. |
| E5 | [PublicPassportPage.tsx](../apps/web/src/pages/PublicPassportPage.tsx), [TrustSignal.tsx](../apps/web/src/components/TrustSignal.tsx), [verifiedWork.ts](../apps/api/src/lib/verifiedWork.ts), [passport.routes.ts](../apps/api/src/routes/passport.routes.ts): corrected counting, provenance categories, score, artist-only connection route, aggregate evidence. |
| E6 | [BookingDetailPage.tsx](../apps/web/src/pages/BookingDetailPage.tsx): URL-driven payment success message at lines 66–75; payment status displayed separately; review mutation invalidates booking but not context. |
| E7 | [CommunicationsPage.tsx](../apps/web/src/pages/CommunicationsPage.tsx): five categories, typed action labels, no query-error rendering, no resolved-action filtering, keys beginning `communications`; [useSSE.ts](../apps/web/src/hooks/useSSE.ts) invalidates other keys. |
| E8 | [api.ts](../apps/web/src/lib/api.ts): 20-second timeout, 401 logout and hard redirect, precise studio-selection 409 handling. [App.tsx](../apps/web/src/App.tsx): role routing, auth return path and legacy redirects. |
| E9 | [ArtistProfilePage.tsx](../apps/web/src/pages/ArtistProfilePage.tsx): presign → PUT → completion registration, success after completion, generic upload failure and multi-file mutation calls. |
| E10 | [accountArchitecture.ts](../apps/web/src/lib/accountArchitecture.ts), [ProfessionalOnboardingPage.tsx](../apps/web/src/pages/ProfessionalOnboardingPage.tsx), [StudioTeamPage.tsx](../apps/web/src/pages/StudioTeamPage.tsx): five roles; Manager is a studio position, not a sixth global role. |
| E11 | [index.css](../apps/web/src/index.css), [artist-experience.css](../apps/web/src/styles/artist-experience.css): tokens, global focus/motion foundations, ambient styling, role retrofit. Documented surface `#141414` conflicts with root `--surface: #111111`. |
| E12 | [activityEvents.ts](../apps/api/src/lib/activityEvents.ts), [financialLedger.ts](../apps/api/src/lib/financialLedger.ts), [schema](../prisma/schema.prisma): durable event records and relational domain owners; evidence/projections are not a second ledger. Invitation event emission follows the claim asynchronously. |

## A. Market Readiness Scorecard

**Provisional score: 5.1/10**, equal-weight mean of the 15 dimensions below (77/150). This is a source-based readiness index, not a market valuation. An 8 means coherent, recoverable core journeys validated with real users and representative devices; 10 means sustained evidence across markets and operating conditions. Strong branding cannot compensate for a false financial confirmation. Release gates in V override the average.

| Dimension | Score | Concrete gap to 8; user/business consequence |
|---|---:|---|
| Clarity | 6 | Real next action exists, but “Open,” contribution/workroom vocabulary and Calendar entry require interpretation. Slower activation. |
| Visual coherence | 4 | 2,094 raw hex uses, 24 injected style files and drifting surfaces still coexist. Users relearn hierarchy on each route. |
| Responsiveness | 5 | Responsive utilities and mobile navigation exist; long content, zoom and narrow screens untested. Twelve pages lack local responsive markers, which is a triage signal, not proof of failure. |
| Speed | 5 | Route lazy loading and context aggregation help; no latency measurements, post-auth delay and all-query Communications loading remain. Trust in responsiveness is unproven. |
| Trust | 6 | Corrected evidence and domain boundaries are strengths; payment URL toast overclaims, static trust categories lack item-level proof. |
| Accessibility | 4 | Global focus exists, but tiny labels and low-contrast text remain; no rendered keyboard/contrast coverage. Excludes users and reduces professional usability. |
| Localization | 3 | English strings and US formatting persist; locale-aware dates are inconsistent; currency/timezone meaning needs explicit presentation. International errors risk bookings and money. |
| Consistency | 4 | Shared query intent exists without consistent invalidation or error semantics. Same event can produce different visible states. |
| Professionalism | 6 | Sessions, receipts and credits convey real operations; ambiguous payment success and incomplete public proof weaken credibility. |
| Distinctiveness | 7 | Creative evidence, identity and studio context are recognizably OIANO; expression is not yet consistently tied to useful work. |
| Emotional quality | 6 | Creator imagery and identity help; microtype, dashboard density and silent failures can reduce creative confidence. Validate with creators. |
| Information hierarchy | 5 | One ranked action is progress; progress, money and people are still fragmented; priority is sometimes based on notification type rather than current pending work. |
| Error recovery | 4 | Some mutations preserve form state, but hard auth redirect and generic upload failure lose orientation; Communications may turn failure into emptiness. |
| Onboarding | 7 | Artist onboarding can create real work; professional setup exists. Invitation intent and equivalent engineer/manager entry are incomplete. |
| Daily usability | 5 | Operational views are useful; no explicit “since your last visit,” inconsistent resumption and stale context reduce continuity. |

### International standard: benchmark behaviors, not appearance

These sources establish expected capabilities, not proof that copying a product increases conversion.

| Category | Primary reference | OIANO standard inferred from it |
|---|---|---|
| Serious creative software | [Ableton crash recovery](https://help.ableton.com/hc/en-us/articles/115001878844-Recovering-a-Set-manually-after-a-crash) | Work and recovery paths matter more than an uninterrupted decorative experience. Preserve drafts and explain recoverable states. |
| Collaboration and international productivity | [Notion inbox and notifications](https://www.notion.com/help/updates-and-notifications) | Updates stay attached to relevant work and can be triaged. OIANO should group by project and distinguish waiting from resolved. |
| Studio/space operations | [Skedda setup guide](https://support.skedda.com/en/articles/2689785-6-quick-steps-to-get-started-with-skedda) | Availability, resource information and access rules should be understandable before commitment. This is a space-operations reference, not a claim Skedda models music production. |
| Financial interfaces | [Stripe Checkout](https://stripe.com/payments/checkout) | Clear checkout context and localized presentation support confidence. OIANO must additionally show its own authoritative settlement and booking states independently. |
| Creator platforms | [SoundBetter workflow](https://soundbetter.com/faq/15-how-does-soundbetter-work) | A work agreement, delivery and payment must form a comprehensible sequence. Do not import another platform's commercial model. |
| Creative review | [Adobe Frame.io review guide](https://experienceleague.adobe.com/docs/creative-cloud-enterprise-learn/assets/Video-review-with-Frame.io.pdf?lang=en) | Versions and feedback belong together; a reviewer should know which file a decision concerns. |
| Accessibility across categories | [W3C WCAG 2.2 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/) | AA contrast, reflow, keyboard operation, focus visibility/non-obscuration, target sizing and announced status are engineering acceptance criteria. |

## B. Adoption & Retention Diagnosis

The product now supports **work → counted progress** better than the previous audit. It does not yet reliably support **progress → inspectable proof → contextual invitation → resumed collaboration**.

Three sources of avoidable abandonment are visible:

1. **An action can appear complete before its domain confirms it.** E6's URL success toast risks an immediate mismatch between what the user believes and what the booking shows. This is a trust and support burden, not an aesthetic issue.
2. **Useful work can become invisible or look unresolved.** E7 defaults failed queries to empty arrays; E1/E2 and Communications do not receive the corresponding SSE invalidations. Users must refresh or reconstruct state.
3. **Acquisition intent does not survive entry.** E3 returns an invite link that E4 ignores. Public Passport routes non-artists through an artist-only connection destination. The user understands the offer but cannot complete it.

The highest-value improvement is reliable orientation: “This is your work; this changed; this requires you; this is the next permitted action.” Retention should be measured as completed work and useful return, never minutes spent in the app.

Willingness to pay remains a hypothesis. The strongest current value propositions are fewer scheduling mistakes, coherent delivery/payment records and reusable professional evidence. Show these benefits with actual records and test whether studios and creators choose OIANO for their next job. Do not infer willingness to pay from a preference for dark styling.

## C. Visual Governance Diagnosis

The historical diagnosis remains valid: documented tokens do not govern implementation. More token references have not reduced the raw-color population. CSS namespaces, inline objects, utilities and injected rules can coexist technically, but they currently permit each route to choose its own semantic meaning.

**Lightweight ownership:** one frontend maintainer owns primitives and token definitions; one product/design owner owns hierarchy and vocabulary; each domain owner approves status meaning. These are responsibilities, not new job requirements or committees. Every new pattern needs a named consumer and a reason existing primitives cannot serve it.

**Working contract:** approved canvas/panel/raised/overlay surfaces; one spacing and type scale; one icon mapping per meaning; one focus baseline; approved state treatments. The business contract stays in the domain. A badge never changes eligibility or money.

**Review checklist:** Is there one primary action? Does its verb match the actual command? Is status read from its owner? Is the monetary currency visible? Are loading, empty, error, stale and permission states distinct? Does keyboard focus remain visible? Does the surface work at 320 CSS px and 200% zoom? Does it respect reduced motion? Does it preserve context? Can the creator explain the evidence? Are exceptions documented with scope and an owner?

New code on migrated surfaces may not add raw functional colors. CI should compare against a scoped baseline rather than blocking the entire legacy app. Exceptions cover creator artwork and controlled brand illustrations, never arbitrary status colors. See S/R8 for the scored governance work.

## D. Value Signal Audit

| Signal | Expressed well today | Gap and replacement | Outcome; backlog |
|---|---|---|---|
| Operational confidence | Pulse/Runsheet, booking status vocabulary | Context ignores already-started sessions through `starts_at >= now`; distinguish underway, awaiting studio confirmation and upcoming | Fewer missed commitments; R2 |
| Professional handling | Receipt, payment record, review actions | Checkout return claims receipt and confirmation too early; show checking/settled/failed independently | Trust, lower support; R1 |
| Visible progress | Completed-session count shared with Passport | Cumulative totals do not say what changed or which project advanced | Useful return; R9 |
| Identity | Avatar, releases, Creative DNA, public Passport | Aggregate Passport percentage competes with work and may imply reputation | Credibility, sharing; R6 |
| Trust | Explicit artist-provided versus studio activity explanations | Trust cards are unconditional category labels; no per-item source trail | Evidence comprehension; R6 |
| Calm | NextAction chooses one item | Small typography and several equal cards demand inspection | Faster comprehension; R8 |
| Speed | Shared context query, lazy routes | Silent query failure, no field latency baseline, unnecessary entry delay | Task completion; R3/R12 |
| Continuity | Domain records, dated messages, project links | No last-visit delta; hard logout loses route/draft | Resume and recovery; R5/R9 |
| Recognition | OIANO mark now reaches public artifacts | Brand material still dominates entry more than work quality | Professional recommendation; R8 |

**Visual luxury test:** global ambient glow in E11 and layered orbits/gradients in Enter are expression, not evidence of value. Gold is currently used for brand, Passport score and actions; it must not imply payment settlement or verification. NextAction's tiny uppercase eyebrow and generic button weaken a genuinely useful capability. Oversized empty cards in Communications consume attention without helping someone recover or start work. Retain restrained brand expression on marketing and Passport, replace attention-demanding motion in working views with clear state changes, and use empty states to explain the next useful action. These are R8 changes, not a separate redesign.

**Current perceived-value ranking (I):** strongest: (1) booking/session operational context, (2) delivery and review, (3) financial records/receipts, (4) corrected work history, (5) creator public presentation. Weakest: (1) creator invitation entry, (2) return-after-action freshness, (3) public evidence inspection, (4) error/unknown-state communication, (5) decorative dashboard metrics without a decision. Strongest means promising and tangible, not free of the defects documented here.

## E. Activation Audit — first ten minutes

No stopwatch observations exist. Counts below are source-visible flow stages and navigation controls, not observed clicks or rendered above-the-fold counts. Role, existing data, viewport and membership change the actual path. TTFV begins at completed signup; time to understand begins at first exposure. The ten-minute test ends at minute ten even if the task is unfinished.

| User | First surface and likely understanding | First meaningful action | Source-visible interpretation burden | Target, to validate |
|---|---|---|---|---|
| Artist | Enter → Identity → Status → Calendar → Formation; default destination Calendar | Submit a valid real booking request; confirmed session is a later outcome | Signup form plus four local steps; two post-signup route transitions to onboarding and destination. Mobile nav defines five options. Name “Formation” and pending-vs-confirmed are hesitation points | Explain purpose in ≤60s; first valid request ≤5min with test availability/funding; ≤2 route changes from post-signup to value |
| Producer | Enter professional signup → professional setup → Producer dashboard | Create a real project or accept a valid contribution | Signup, one setup form, project/accept flow; four ProducerNav destinations. Dashboard and contribution inbox remain different concepts | ≤60s comprehension, ≤5min project creation or acceptance; invited work bypasses unrelated setup |
| Engineer | Existing authorized account → role-specific dashboard; self-registered professional discipline is a different path | Open assigned session and record permitted work | Calendar and Runsheet top links; four engineer mobile options. Independent ENGINEER vs professional identity is not self-explanatory | Assigned session accessible in ≤2 navigation changes and ≤2min after login |
| Studio | Staff/admin login → Admin; studio selection when needed; verification/setup for a new studio | Publish usable availability or manage a real booking | Operational destinations include Calendar, Runsheet, Pulse, Facilities; setup forms are conditional and not fully timed here | Existing operator finds next commitment ≤60s; new studio has usable test availability ≤10min excluding external verification |
| Manager | Studio staff invitation and capability-bearing membership; no global MANAGER role | Resolve an assigned studio booking/issue with granted capability | Auth → invite acceptance → dashboard, possibly studio selection. Manager must understand which studio and permissions apply | Accept existing-account invitation and reach authorized task ≤3min; no role impersonation |

**Ambiguity samples, not exhaustive counts:** artist next action has one generic “Open”; pending session copy says “confirm you're coming” without exposing the studio confirmation distinction; Public Passport presents a connect action to unsupported viewer roles; manager invitation creation does not expose its returned link in the current Team success handler. These become task failures or hesitation markers in R, not invented activation-time estimates.

Change the entry contract (R4/R7): preserve intended work through authentication and setup; default ordinary return to meaningful current context; offer “Start a project,” “Book a session” and “Respond to an invitation” only where the account can perform them. Keep first booking as real value. Do not require a profile score before useful work. Clarify engineer professional discipline versus studio permissions without forcing users to understand database roles.

## F. Returning User Audit

| Home responsibility | Current source | Desired hierarchy |
|---|---|---|
| NOW | Ranked session, money, deliverable, rights and credit actions | One primary action with exact verb and record link; distinguish uncertainty from all-clear |
| IN MOTION | Counts of upcoming sessions and active projects | Compact active-work list with last meaningful change and resume link |
| NEXT | One next session | Show date/timezone and confirmation status; approaching deadline earns emphasis |
| PROGRESS | Cumulative completed sessions/hours | Quiet “Since your last visit” summary, backed by dated authoritative changes |
| MONEY | Outstanding USD and wallet balance | Visible currency and status; only blocking/overdue items compete with NOW |
| PEOPLE | Rights/credits partially represented; Communications elsewhere | “Waiting for you” versus “Waiting for Alex”; consent and relevant invitations included |

Do not create six equally loud dashboard tiles. At first paint use one NOW region, a compact IN MOTION list and one NEXT row. Place PROGRESS, MONEY and PEOPLE below or reveal them when relevant. Money requiring immediate action belongs in NOW. An all-clear user should see their current work, not a misleading empty life.

E1 returns `generated_at`, but NextAction does not show freshness. Context excludes already-started bookings from its upcoming selector. `CONSENT_REQUESTED` exists in the type but has no populated branch. Rights routes to `/projects` rather than the agreement. The attention list selects only one deliverable/right/credit, so “more waiting on you” is a count of selected categories/items, not a complete pending-work count. Label it accordingly or return honest totals.

E7 is a meaningful consolidation but does not solve continuity: actionability is derived from notification type, not whether the source decision is still pending. The stream refreshes `notifications`, `bookings` and other legacy keys, not `communications` or `context`. Approval can leave the completed item looking actionable until another fetch. R2/R3 must update all affected read models after domain success and on reconnect; staleTime alone is not periodic refresh.

### Legitimate return-trigger map

| Trigger | Current presentation/support | Proposed treatment, urgency and action |
|---|---|---|
| Mix ready | Deliverable context and session-delivered stream exist; generic files-ready toast | One project item, “Review mix v3”; routine until an explicit deadline |
| Session approaching | Context <36h, generic open; pending and confirmed conflated | “Awaiting studio confirmation” or “View confirmed session”; due time/timezone, high near start |
| Collaborator response | Connection/messages and new-message toast | Group by work; “Read Alex's response”; no global urgency by default |
| Invitation received | Contribution/staff flows exist; creator bearer link unwired | Explicit inviter, purpose and acceptance consequence; normal priority, expiry shown |
| Payment required | Balance action | Currency, source booking and due time; high only if due/blocking; “Review payment” |
| Payment received | Payment event/wallet update; unsafe redirect toast | Confirm authoritative state then “View receipt”; informational |
| Project milestone | Project phase exists; no dedicated canonical milestone event in inspected union | “Mix approved”; link to accepted version; quiet progress |
| File uploaded | Upload success and records; no canonical file-upload event in union | Group files under session/project; notify only recipient needing action |
| Booking confirmed | Stream status and toast | Dated confirmation with booking link; normal priority, higher if imminent |
| Passport evidence added | Completion updates feed; no dedicated evidence-added event | “Completed session added to your record”; inspect source, optional share |
| Studio opportunity | Discovery exists; no verified opportunity trigger in inspected context | Opt-in relevant opportunity with terms and expiry; never manufactured scarcity |
| Progress milestone | Aggregate progress exists | Private factual summary, no streaks; link to the actual completed work |

Use one notification per domain transition and recipient, grouped by project. Do not send a second toast merely because both a specialized stream event and a persisted notice describe the same change. Re-fetch current domain state when opening old notices. Measure useful actions, unresolved items and opt-outs, not notification volume. R9 owns this specification.

## G. Trust & Failure Experience Audit

**State language must say what happened, who confirmed it, when, and what can happen next.** A booked slot is not a performed session. An uploaded object is not a registered deliverable. A paid charge is not automatically a confirmed booking. An accepted invitation is not a verified working relationship.

| Domain | Present strength | Gap/required language |
|---|---|---|
| Payment | Server payment state and ledger ownership | “Checking payment status” on return; “Paid — USD … — receipt …” only from server. Distinguish unsuccessful, pending and partial |
| Booking | Central status vocabulary | “Awaiting studio confirmation,” “Confirmed,” “In progress,” “Completed,” “Cancelled,” “No-show”; retain cause/time where available |
| Session | Completion domain and log | Display scheduled vs actual/logged context honestly; clock never certifies completion |
| File | PUT then registration, success after registration | “Uploading,” “Saving file record,” “Available,” or “Could not verify completion”; filename/version remains visible |
| Invitation | Expiry and conditional claim | “Pending,” “Accepted,” “Expired” derived from expiry, or “Revoked” only if actually revoked; explain relationship separately |
| Passport | Completed-only session definition | Per-item provenance, timestamps and correction route; artist claims remain attributed |
| History/receipt | Durable records and receipt surface | Receipt must describe the payment state it represents; history should survive later presentation changes |

### Failure matrix: source findings and required runtime tests

| Scenario | Source finding / confidence risk | Runtime injection and recovery acceptance | Backlog |
|---|---|---|---|
| Failed payment | Checkout initialization error is shown; `?payment=success` can falsely claim receipt/confirmation | Decline test payment, delay webhook, manually add success query. Zero paid/confirmed claim without authoritative response; allow status refresh before retry | R1 |
| Expired creator invite | API returns generic 410; frontend never accepts | Open expired token after login; neutral “This link can no longer be used,” preserve sign-in and offer inviter contact/new link | R4 |
| Already-used invite | Same 410 and atomic claim guard | Replay/concurrent accept; one acceptance only; no destructive restart. Do not expose token validity distinctions to unauthenticated probes | R4 |
| Failed upload | Generic toast loses stage distinction; no per-file recovery queue in inspected flow | Fail presign, PUT and registration separately. Keep filename/state; retry safe stage; reconcile unknown registration before uploading again | R5 |
| Network loss | 20s API timeout; NextAction disappears, Communications defaults data to empty | Disconnect with loaded work and during fetch. Show retained data plus “Unable to update”; never “Nothing” from an error | R3 |
| Stale page | SSE keys omit context and Communications | Approve in second tab, reconnect first. Refresh affected query families and remove resolved action without forced navigation | R2/R3 |
| Duplicate action | Button disabling covers some local repeats; creator invite conditional claim protects one domain | Double-click, concurrent tabs and lost response. Verify each command's domain idempotency/state guard; do not infer all commands safe from one | R1/R4/R5 |
| Booking conflict | 409 conflict is deliberately separate from studio-selection 409 | Race two requests for slot. Keep date, room and participant choices; explain occupied slot and offer refreshed availability | R5 |
| Expired auth | 401 clears auth and hard-navigates `/login`; guarded route's `next` preservation is bypassed | Expire token with draft. Preserve non-secret draft and safe work return path; re-authenticate, revalidate permissions, ask to resubmit | R5 |
| Permission change | AccessBoundary/403 can protect data; draft and recovery behavior not demonstrated | Revoke membership while page open. No unauthorized mutation; retain safe context and show who can help without disclosing restricted data | R5 |

Never blame the user for an unknown result. “We couldn't confirm whether this saved. Check status” is preferable to “Failed—try again” when a write may have succeeded. No client retry may duplicate a financial effect. Mutation-check the load-bearing regression tests during implementation.

## H. Passport Market Value Audit

| Viewer question | Current answer | Gap and desired answer |
|---|---|---|
| Who is this creator? | Name, alias, portrait, biography, location and links | Strong basis; honor creator identity, languages and chosen imagery |
| What have they done? | Releases, completed project/session totals | Separate artist-provided releases, project phase and verified completed sessions |
| Who worked with them? | Current public page does not expose a counterparty evidence list | Show authorized confirmed credits/counterparties with source and privacy controls |
| What is verified? | Three provenance category cards | Attach provenance to each fact. The static studio category must not imply every profile has studio evidence |
| What is current? | Availability status and current projects | Show updated/confirmed dates; avoid suggesting stale availability is live |
| How can I work with them? | Connect CTA and collaboration interests | Artist route works for its intended role; non-artist viewers can be sent to auth and still lack access |
| What should I do next? | Connect or manage; print EPK | Match viewer capability and creator availability, preserve intent through signup |

The Passport can be proof of work and an acquisition surface only when evidence is inspectable. “Passport 80%” is completeness, not credibility, and should not compete with verified work in the public hierarchy. If retained, label what it measures; preferably keep profile-completion coaching private.

Completed-session counting is corrected. Its hours derive from scheduled start/end spans of completed bookings, rounded to whole hours; do not relabel them “verified actual hours worked” without an actual-time source. Completed status proves what the system recorded, not independent third-party auditing of every claim.

The existing print rule hides actions and forces dark printing. This is progress over absence, not proof of a professional EPK. R6/R8 should verify A4 and Letter, long names, multiple releases, QR rendering, page breaks, light print surfaces and selectable text. Footer claims must not be broader than the visible evidence. Export should preserve privacy, provenance and correction dates.

## I. Invitation Adoption Audit

**Critical distinction:** creator invitations, contribution invitations and studio staff invitations are different relationships. The current creator route records who accepted whose invitation. It does **not** grant a project role, connect two artists or add studio permissions. A token is a bearer credential; the API records an email but acceptance does not enforce a matching account email. UI must not promise an email-bound relationship this contract does not provide.

| Moment | Appropriate offer | Relationship and boundary |
|---|---|---|
| Add collaborator | “Bring Alex into this project” after choosing role/scope | Requires domain-backed contribution invitation and access preview; current generic invite is insufficient |
| Assign work | “Invite reviewer for this deliverable” | Explicit allowed action and expiry; do not grant blanket workspace access |
| Book with external participant | “Include session participant” | Only once participant permissions exist; no implied booking ownership |
| Studio brings existing client | “Invite client to manage their sessions” | Client relationship, never staff membership |
| Producer brings artist | “Invite artist to work on [project]” | Existing account signs in and accepts explicit project participation |
| Completed project | Quiet optional share or collaborator invitation | Suggest only when there is someone relevant; never gate completed work behind inviting |
| Passport share | Creator chooses share; visitor chooses contact/participation | Share grants public visibility, not membership or verified relationship |

Minimum R4 flow: create → show one-time link with copy confirmation → preserve token through auth/setup → explain consequence → accept deliberately → show authoritative result → return to useful work. Explain “You'll receive a link to join OIANO; this does not grant project access” for the current generic contract. Existing users sign in rather than create duplicates. A safe account-switch option must preserve intent. Do not silently accept on page load.

The API exposes no creator resend/revoke endpoint in the inspected router, though the schema permits REVOKED. Do not draw controls that cannot execute. Define a replacement-link policy before displaying “Resend.” Its 25-open-invite limit is a bound, not evidence of complete abuse protection under concurrency. No invitation email is sent by this route: it returns a link for the inviter to share. Measure created, link copied and accepted separately; never call created links “delivered invitations.”

## J. Environment Mode Standard

All modes use the same semantic surfaces, typography roles, focus behavior and state language. Mode changes density and expression, not the meaning of success or evidence.

| Mode | Density / emphasis | Motion / expression | Hierarchy / imagery / contextual branding |
|---|---|---|---|
| Marketing | Low; purpose and real work examples | Restrained optional motion; highest OIANO expression | Purpose → evidence example → join; licensed creator work, no implied endorsements |
| Onboarding | Low; one decision | Transition only; moderate expression | Why this step → field/action → skip/next when valid; creator identity appears early |
| Creator Home | Medium; work requiring user | Only meaningful state transitions; quiet brand | NOW → active work → next commitment → progress; creator art supports recognition |
| Project workspace | Medium/high; artifact and collaborators | Minimal; creator work carries expression | Task → file/version → decision/history; project artwork allowed |
| Studio operations | High; time, resource and exceptions | Live indicator only; low expression | Conflict/next commitment → timeline → detail; studio mark secondary to OIANO grammar |
| Finance | Medium; amount, currency, status and receipt | No ambient/decorative motion; low expression | Amount/state → counterparty/time → evidence/history; no mood imagery |
| Passport | Medium/low; creator and work evidence | Static by default; creator-led expression | Identity → proof → current work → collaboration; artist artwork dominant, OIANO issuer mark secondary |
| Maintenance/system health | High; severity, scope and recency | Minimal; no luxury treatment | Incident → affected system → recovery/history; no creator artwork |

## K. Semantic Token Migration Plan

Smallest useful foundation (names proposed, not implemented):

| Category | Tokens / constraints |
|---|---|
| Surface | `surface.canvas`, `surface.panel`, `surface.raised`; overlay separate |
| Text | `text.primary`, `text.secondary`, `text.muted`, `text.onAction`; muted still readable |
| Border | `border.subtle`, `border.control`; decorative separator and interactive boundary have different contrast needs |
| Action | `action.primary`, `action.hover`, `action.disabled`; text token defines valid pairing |
| State | success, warning, danger, info, neutral; each a tested foreground/background pair |
| Trust | `trust.recorded`, `trust.claimed` map to approved state/text pairs; text specifies provenance, color does not certify |
| Finance | Reuse state tokens; `finance.amount` uses primary text and tabular figures. No separate gold-paid palette |
| Focus / overlay | `focus.ring`, `overlay.scrim`; test on every approved surface |
| Expression | `brand.accent`, `context.artwork`, `context.studioAccent`; cannot override action, error or verification meaning |

Retain binding brand gold `#C9A84C`, canvas `#0a0a0a` and documented surface `#141414` as the starting compatibility palette. Resolve the current `#111111` root surface discrepancy through reviewed aliases; do not silently alter all legacy consumers. The first slice chooses and tests semantic pairings, then migrates by meaning. Do not equate `--muted` (a surface tone) with readable muted text.

Spacing: 4/8/12/16/24/32, with 48 for outer sections only. Radius: 6/10/16 plus pill. Type: 12 metadata, 13 supporting label, 15 body, 17 emphasis, 21 section, 28 page, 40 display; scalable rem equivalents. No essential task copy below 12. Playfair Display for selective expressive titles, DM Sans for work, JetBrains Mono for identifiers/tabular data. Weights 400/500/600/700; justify exceptions. Lucide icons use consistent stroke/size, labels for unfamiliar actions and accessible names for icon buttons. Motion 120–200ms for transitions; reduced-motion removes nonessential movement and preserves status feedback.

Classify before replacing:

| Class | Examples | Migration |
|---|---|---|
| Functional semantic | Error red, link blue, booking status | Keep meaning; normalize to tested semantic pairing |
| Legitimate context | Album artwork, artist image, small studio accent | Allow bounded expression tokens; never recolor user artwork |
| Near-duplicate drift | Competing near-blacks, ad hoc borders/radii | Collapse by surface role after contrast and layout inspection |
| Orphan decoration | Unused glow/shadow, decorative singleton without domain meaning | Remove or replace with spacing/hierarchy; check references before deletion |

Inventory → map by role → introduce compatibility tokens/primitives → migrate four surfaces → visual/behavior validation → expand route-by-route. No global search-and-replace over 2,094 colors. Tailwind utilities should resolve to the same tokens; injected global rules must not become a second semantic system. Budget and ownership: R8.

## L. Design Debt Baseline

Measured on the working tree during this audit: **108 TSX files and four CSS files** under `apps/web/src`, including legacy/unmounted source. These are source-inventory measurements, not the bundle or rendered screen count. Keep this scope fixed for comparison and separately report the four-surface slice.

| Metric | Current baseline | Definition / limitation |
|---|---:|---|
| Raw hex occurrences | **2,094** | TSX lexical `#[0-9a-fA-F]{3,8}\b`; includes comments, embedded CSS and alpha hex |
| Exact six-digit occurrences | 1,385 | `#[0-9a-fA-F]{6}(?![0-9a-fA-F])`; excludes alpha suffix |
| Exact six-digit distinct / singletons | **332 / 213** | Lowercased exact-six values; not all RGB/RGBA or Tailwind colors |
| Token references | **155** | Literal `var(--` in TSX, all custom properties, not necessarily color |
| Token-vs-hex lexical share | 6.9% | 155/(155+2094); historical 72/(72+2094)=3.3%. Proxy only, not semantic color coverage |
| Padding expressions | 331 occurrences / 153 distinct / 84 singletons | TypeScript AST property assignments named `padding` |
| Gap expressions | 217 / 27 / 9 | Same AST method |
| Radius expressions | 312 / 23 / 6 | Same method; numbers and expressions, no CSS/Tailwind inventory implied |
| Font-size expressions | 635 / 51 / 20 | Same method; not 51 rendered sizes |
| Font-weight expressions | 115 / 7 / 4 | Includes two conditional expressions; static weights are 400/500/600/700/800 |
| Static one-off font weights | 400 once, 800 once | AST inline subset only; do not infer regular body text is absent |
| Shadow expressions | 22 / 22 / 22 | AST `boxShadow`; does not count embedded CSS `box-shadow` |
| Width expressions | 158 / 57 / 34 | AST `width`, includes percentages and dynamic values |
| Numeric fixed-width occurrences / files | 66 / 28 | TSX lexical `width: NUMBER` before comma/brace; icons included; not 66 layout defects |
| Arbitrary utility spacing | 7 occurrences / 6 values | `p/m/gap/space` bracket utilities; not the much larger inline/CSS spacing inventory |
| Injected style files | 24 | TSX containing `<style`; unchanged historical governance signal |
| Print rules | 4 | TSX+CSS `@media print`; number of rules is not export quality |
| Focus-visible selectors | 6 | Five role-scoped selectors plus one global selector; not six separate global rules |
| Reduced-motion files | 10 | Files containing `prefers-reduced-motion`; not universal compliance |
| Pages without local responsive marker | 12 | Listed below; inherited CSS may make them responsive |
| Duplicate components | Historical six metric-like implementations | Candidate consolidation set, not a clone-detector measurement |
| Duplicate icon meanings | Not yet measured | Need rendered inventory of icon + label + intent; no fabricated count |
| Surfaces with rendered contrast failures | Not yet measured | Historical audit reports failing declared colors. Current source still uses zinc-600/700 and `#666` for small text; composed contrast requires screenshots/computed styles |

Responsive-triage pages: AcceptStudioInvite, Connect, Discover, ForgotPassword, Legal, NotFound, Notifications, OnboardingSequence, ProducerDiscover, ProjectDetail, ResetPassword, SelectStudio. “No local marker” means no `sm/md/lg/xl:` utility, `@media`, `matchMedia` or `ResizeObserver` in that file; it does not mean no responsive behavior. Notifications is currently redirected and should not receive runtime priority over active routes.

Historical 138 padding values/16 radii/44 font sizes were measured differently. Do not claim increases or decreases against the AST counts. The exact 2,094 and 332/213 historical figures reproduce under the lexical definitions above; the distinction between “raw hex” and “six-digit hex” matters.

### Reproduction procedure

Use Node plus the repository's TypeScript package. Recursively enumerate `apps/web/src`; count lexical metrics on concatenated TSX (print/focus/motion on TSX+CSS). For expression metrics parse each TSX with `ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)`, walk `ts.forEachChild`, select `ts.isPropertyAssignment`, and group `node.initializer.getText(sourceFile)` by `node.name.getText(sourceFile)` for the properties in the table. A singleton is a value appearing once across that scope. Preserve expressions rather than splitting on commas inside strings. Record commit, dirty files, file scope and definitions beside each rerun. No baseline should be compared to a regex approximation of AST values.

For runtime debt use one fixture matrix per migrated surface: empty, busy, long text, error, stale, pending and complete; 320/390/768/1440 CSS px; 200% zoom; keyboard; reduced motion; high contrast where supported; A4/Letter for Passport. Record failing elements, not just failing pages. R8/R12 own the unmeasured baseline work.

## M. Adoption Ladder

| Level | Current support | Likely drop / proof required |
|---|---|---|
| 0 Visitor | Expressive entry and public Passport | Must explain real creative-work value, not only the brand |
| 1 Registered | Artist/professional signup | Invite token/return intent can be lost |
| 2 Activated | Real booking path, professional project/contribution surfaces | Equivalent role-specific first win not consistently guided |
| 3 Working | Sessions, projects, files, rights and credits | Several vocabularies and destinations require reconstruction |
| 4 Returning | Home context and Communications exist | No reliable fresh/delta contract or retained draft journey |
| 5 Trusting | Ledger and performed-work foundation | False success or unavailable-data-as-empty can reverse trust immediately |
| 6 Connected | Staff, contributions, artist connections | Generic creator invitation does not establish working relationship |
| 7 Advocate | Public Passport/share artifact; invitation API | Share-to-supported-action and invite acceptance gaps |
| 8 Embedded | Persistent work/financial/evidence history | Repeated successful collaboration and portable history not demonstrated by adoption data |

These are increasing commitments, not a forced funnel: someone can arrive by invitation and work immediately. Track the event defining each level and never manufacture profile chores to make everyone visit every step.

## N. Retention Moat Analysis

| Accumulated asset | Architecture support | Legitimate retention value / missing proof |
|---|---|---|
| Project and session history | Domain records, completion/log ownership | Resume previous work and repeat setup; need accessible consolidated history |
| Work evidence and accepted credits | Performed sessions, credits, Weave evidence | Reusable professional record; need item-level public provenance and correction |
| Trusted collaborators/studios | Connections and work-backed projections | Lower coordination burden; distinguish work evidence from introductions |
| Payment history | Transactions/ledger and receipts | Less uncertainty and fewer reconciliation conversations; presentation must match truth |
| File history | File/deliverable records | Faster recovery and reuse; version lineage/export completeness must be verified before promising it |
| Scheduling/repeat workflows | Bookings and studio relationships | Less repetitive setup; saved preferences and repeat workflow usefulness need testing |

The defensible retention claim is **accumulated usable context**, not inconvenience engineered into leaving. Provide export of authorized records and files, understandable provenance, consent controls, correction processes and clear retention terms. Do not make historical access conditional on inviting people or hide evidence behind artificial barriers. R13 covers portability.

## O. Market Moat Analysis

| Candidate | Architecture accumulates it? | Defensibility judgment |
|---|---|---|
| Verified creative work graph | Yes, work-backed evidence/projection structure | Potential moat only with trustworthy coverage and repeated counterparties; graph existence is not network scale |
| Longitudinal evidence | Dated work and event records | Potentially hard to recreate after years; gaps in lifecycle coverage and correction visibility reduce value |
| Trusted creator/studio relationships | Yes, scoped relationships and work occurrences | Potential local density advantage; no density or retention data established |
| Transaction history | Yes | Private operational context, not exclusive payment-rail advantage or permission to monetize financial data |
| Repeat collaboration patterns | Derivable from domain history | Useful decision support; no validated predictive advantage yet |
| Studio utilization intelligence | Booking/room records support analysis | Potential customer value; data quality and comparable utilization denominators must be validated |
| Passport reputation | Evidence exists; public proof incomplete | Not yet a demonstrated reputation standard |
| Regional creative density | Geographic direction exists | Hypothesis; requires measured active cross-party work within real markets |

Features, brand gold and schemas are copyable. The potential moat is a consented, accurate history that makes repeated work easier for both sides. Do not call profile completeness, inviter attribution or an unverified credit a trust score. Do not claim defensibility until retention, evidence quality and counterpart density are observed. R13/R14 are the later validation work.

## P. User Value Metrics

Use domain outcomes as numerator; exclude seed/demo/test/internal activity. Count distinct authoritative records, deduplicate by domain ID and report corrections/reversals. An emitted event may be missing after a successful write; reconcile analytics to domain records. Never make analytics the source of financial truth.

| Metric | Definition / source | Why valuable |
|---|---|---|
| Projects completed | Distinct eligible projects entering delivered/completed domain state in period; show reversal policy | Actual creative output |
| Sessions completed | Distinct `COMPLETED` bookings; report scheduled duration separately from actual time | Performed work |
| Collaborators connected | Distinct counterpart pairs with accepted participation **and first real shared work**, not generic invite acceptance | Collaboration quality |
| Evidence accumulated | Distinct qualifying source-backed evidence records, with corrections tracked | Professional record |
| Payments handled | Distinct authoritative successful transactions and currency amounts; refunds separate | Financial reliability |
| Files delivered/approved | Registered deliverables delivered, then approvals as a separate measure | Useful output, not upload attempts |
| Repeat bookings | Same artist–studio pair with another completed booking within 90 days | Continuing studio relationship |
| Time saved | Within-person task time against their existing workflow; report median/range and task equivalence | Direct operational benefit |
| Recovered actions | Failed/unknown attempt followed by confirmed intended outcome without duplicate effect | Confidence preserved |
| External collaborators onboarded | Accepted contextual invitation followed by contribution within 14 days | Productive network growth |

## Q. Adoption Metrics

| Metric | Denominator, window and success |
|---|---|
| Activation | New eligible accounts; meaningful domain outcome within seven days, role-specific: valid booking request, real project created, accepted contribution, or configured usable studio availability. Report each separately |
| Time to first value | Signup completion to first qualifying outcome; p50/p75, completion rate and censored non-completers, not only successful users |
| First session/project completion | Activated cohort completing first session/project within 30/90 days; separate business-cycle windows |
| D1/D7/D30 return | Activated cohort with useful domain work or intentional resume on days 1/7/30 after activation, in stated timezone; also report rolling-window variants separately |
| Task resume rate | Returning users with active work who open its context and perform a meaningful action within that visit / returning users with active work |
| Flow completion | Completed booking/payment/review/invite outcomes / valid flow starts; deduplicate attempts, segment error and permission causes |
| Passport share | Eligible creators with a public Passport using explicit copy/share action / eligible creators in 30 days. Copy is intent, not confirmed delivery |
| Share → visitor → signup | Human visits to share-tagged public links, then signups within seven days; use consented attribution and report unknown cross-device attribution |
| Invitation acceptance | Accepted invitations / created invitations with a full 14-day maturity window; also show copied links and expirations; never assume email delivery |
| Repeat collaboration | Counterpart pairs with second qualifying work within 90 days / pairs with first qualifying work and full follow-up window |
| Studio repeat booking | Artist–studio pairs with another completed booking within 90 days / eligible completed-booking pairs |
| Error recovery | Confirmed outcome within same session or 24h / recoverable failed-or-unknown attempts; track duplicate effects and data loss separately |
| Support request rate | Workflow-related support cases per 100 completed/attempted workflows, separately; categorize payment, access, state and navigation |

Segment by account family, entry intent, studio, language/locale, device/network and new/returning status; avoid publishing identifying small cohorts. Early small samples should show counts and uncertainty, not attractive percentages alone.

Use domain records/events for completed work. Minimal observation instrumentation is needed for exposures, route/resume, copy/share, perceived latency and failure attempts because domain records cannot reveal abandoned intent. This explicitly refines the earlier “no frontend analytics” recommendation: add only necessary, consent-aware metadata, no replay of private creative content, credentials, invite tokens, messages or payment details. Define event ID, schema version, time, pseudonymous actor, workflow/source ID, outcome and reason; reconcile to domain totals. R12 owns instrumentation and definitions.

## R. Cross-Cultural Usability Test Plan

Run two formative rounds of 8–10 people each, then a two-week pilot with 4–6 real studio/creator groups. Small samples identify problems; they do not establish statistically reliable conversion uplift. Recruit artists, producers, engineers, studio operators and delegated managers across home/project studios, independent facilities and larger teams. Include West/East/Southern African and European or other international participants where OIANO expects use, urban and constrained connectivity, young and older adults, non-native English readers, varying technical confidence and disciplines beyond production. Do not treat one participant as representative of a culture. Include keyboard/screen-reader users and long/non-Latin names; test RTL as a supported-target requirement before claiming RTL readiness.

Use equivalent old/new task fixtures and counterbalance order to reduce learning effects. Test the first slice first; only then test contextual invitation adoption. Moderate in the participant's preferred language when possible; distinguish translation comprehension from domain vocabulary. Obtain consent; use test money and controlled invitations.

| Real task | Observe | Proposed formative gate |
|---|---|---|
| Explain OIANO after first exposure | Words used, mistaken social/profile-only interpretation | ≥80% describe work + continuity/evidence without coaching within 60s |
| Start work after signup | Time, options inspected, route changes, forms, help requests | ≥80% complete role-specific first action inside target in E |
| Find the thing requiring attention | First click, backtracks, confidence in pending status | ≥90% identify correct priority; zero money/status misunderstanding |
| Return next day | Identify change, resume original task, recognize counterpart | ≥80% resume unassisted within 60s, where task requires no external wait |
| Explain payment and booking states | Can distinguish paid from confirmed? | Every participant accurately identifies critical money/commitment state after reading |
| Identify verified evidence | Distinguish self-claim, record, counterparty and completeness | ≥90% correct classification; zero inferred government-ID verification |
| Invite an existing/new collaborator | Explain permissions before acceptance, complete return path | ≥80% completion; zero unintended membership or duplicate account pressure |
| Recover from network/upload/auth failure | Retained context, correct retry, fear of duplicate action | ≥90% recover; zero data-loss/duplicate-financial effects |
| Choose next-project workflow | Concrete comparison to current tools | Record actual pilot reuse/invites; stated willingness alone does not pass adoption gate |

Capture task time, navigation count, form submissions, visible competing options, ambiguous actions, pauses >5s and assistance. Record exact hesitation reasons, not imagined preferences. Ask “What do you believe happened?” and “What would you do next?” before explaining. At day 7/14 inspect completed work, actual repeat use and voluntary collaboration. No time-spent engagement target. R12/R14 own this plan.

## S. Prioritized P0 / P1 / P2 / P3 Backlog

Scores are ordinal estimates: User Value (UV), Adoption (A), Retention (R), Trust (T), Market Value (MV), Engineering effort (E), Design effort (D), Risk (K), each 1–5. Higher benefit is better; higher effort/risk is harder. Effort 1 = contained change, 3 = several surfaces/contracts, 5 = broad cross-domain work. Priority index = `(UV+A+R+T+MV)/(E+D+K)`, rounded to one decimal. Trust/release gates outrank the index. Every recommendation in this document is assigned to a work package below; targets are not promised delivery dates.

| ID / priority | Work and scope | UV | A | R | T | MV | E | D | K | Index |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| R1 P0 | Truthful checkout-return/payment/booking presentation; delayed/failed/unknown and duplicate-action regression coverage | 5 | 4 | 5 | 5 | 5 | 2 | 1 | 2 | 4.8 |
| R2 P0 | Context truth/freshness: pending vs confirmed vs underway, exact permitted action, invalidate after decisions; honest attention totals | 5 | 4 | 5 | 5 | 4 | 3 | 2 | 2 | 3.3 |
| R3 P0 | Communications/context loading/error/stale/empty distinction, query-key refresh/reconnect, resolved-action handling | 5 | 4 | 5 | 5 | 4 | 3 | 2 | 2 | 3.3 |
| R4 P1, gate before invite promotion | Usable generic invite journey, intent preservation, one-time-link handoff and honest relationship copy; define recipient binding/replacement policy | 5 | 5 | 4 | 5 | 5 | 3 | 3 | 3 | 2.7 |
| R5 P1 | Recoverable auth, upload, conflict and permission flows; drafts/unknown-write reconciliation | 5 | 4 | 5 | 5 | 5 | 4 | 3 | 3 | 2.4 |
| R6 P1 | Passport item provenance, completeness separation, supported viewer actions, current dates and printable proof | 5 | 5 | 4 | 5 | 5 | 3 | 3 | 2 | 3.0 |
| R7 P1 | Role-aware first-value/return entry, retain safe intent through onboarding and login; manager capability clarity | 5 | 5 | 5 | 4 | 4 | 3 | 3 | 2 | 2.9 |
| R8 P1 | Four-surface semantic foundation/slice, accessible hierarchy, mode grammar and scoped debt governance | 5 | 4 | 4 | 4 | 5 | 3 | 3 | 2 | 2.8 |
| R9 P2 | Since-last-visit and waiting-on-person context; source-backed return triggers, grouping/dedup and action resolution | 5 | 4 | 5 | 4 | 5 | 4 | 3 | 3 | 2.3 |
| R10 P2 | Contextual project/client invitation contracts and second adoption slice; no automatic permission widening | 5 | 5 | 5 | 5 | 5 | 4 | 3 | 4 | 2.3 |
| R11 P2 | Locale/timezone/currency formatting, translation preparation and international content validation | 5 | 4 | 4 | 5 | 5 | 3 | 3 | 3 | 2.6 |
| R12 P1 baseline, P2 rollout | Domain-aligned metrics, latency/debt runtime baseline and two formative rounds; privacy-aware intent measurements | 4 | 4 | 5 | 4 | 4 | 3 | 2 | 2 | 3.0 |
| R13 P3 | Portable authorized history/evidence/file export, correction/consent continuity; measure accumulated usefulness | 4 | 3 | 5 | 5 | 5 | 4 | 3 | 3 | 2.2 |
| R14 P3 | Multi-market repeat-work pilot, regional density and willingness-to-pay validation; expand governance only after evidence | 4 | 4 | 5 | 4 | 5 | 3 | 4 | 3 | 2.2 |

Sequence: R1–R3 correctness first; establish R12 baseline; implement/validate R8 with bounded R6 presentation; finish R4/R5/R7 as entry/recovery prerequisites; then R9/R10 second slice. R11 starts with money/time correctness before broad localization. P0 is a release trust gate, not permission to start code before this audit is complete. No Stripe settlement, wallet, rights state machine or Weave truth ownership change is part of the visual slice.

## T. First Standardization Slice

Four routed surfaces: **Creator Home (`DashboardPage`), artist Project list/selected-project surface (`ArtistProjectsPage`), Public Passport, and Runsheet**. Runsheet satisfies the requested “Pulse or one Studio surface” and keeps scope smaller than Pulse while testing operational density, engineer access and print. Private Passport and Pulse follow after validation; they are not silently added to the first slice.

1. Introduce semantic aliases and five small compositional primitives: Surface, ActionButton/Link, PageHeader, StatusText/Badge, FieldState. Reuse existing status vocabulary, Skeleton and Modal where suitable instead of creating competing versions. Add a PageFrame only for the four consumers; preserve their role navigation.
2. Creator Home: make one next action legible, show a truthful context-unavailable state and reduce competition from passive totals. Preserve server-derived data and current permissions.
3. Project surface: apply identical surface/type/state tokens, show project title/phase/next permitted action; keep project content and navigation intact. This tests whether the foundation generalizes.
4. Public Passport: creator-first hierarchy, readable provenance labels, private completeness separated from public work and A4/Letter print styles. Deeper evidence endpoints belong to R6 and are not pretended to be styling.
5. Runsheet: retain operational density and time/resource scanning; adopt same states/focus/spacing, verify active studio and print. Do not introduce creative-home-sized cards into a working schedule.

Foundation changes are global only where semantics require them; adoption is scoped. Existing focus/reduced-motion rules are reviewed and extended rather than duplicated. Remove retrofit selectors only once their last consumer has migrated. Capture pre/post fixtures before changing a surface. Migrate behind an easily reversible presentation boundary; do not alter domain data or money to demonstrate the design.

Proof: four different environments share the same meaning for surfaces, actions and statuses; one primary action per view; users identify what matters faster without losing information; existing record state and permissions match before/after. Font, spacing and status exceptions must be deliberate and counted, not hidden in inline styles.

## U. Second Adoption Slice

After T passes: **creator context → review actual work → recorded progress → inspect Passport evidence/share → contextual invitation → recipient action → useful return**.

Use one fixture and then one real consenting project group. Begin with a completed studio session and a mix awaiting review. Creator opens Home, selects “Review [mix/version],” submits approval through the existing domain, sees that review recorded and the pending action disappear, then inspects the already-earned session evidence. Approval must not fabricate another completed session or double-count evidence.

Sharing is optional. The creator previews which Passport information is public, copies a link, then chooses a relevant project invitation for an external collaborator. A public share and a project invite are different artifacts with different access. If only the generic invite exists, label it as joining OIANO and do not claim the project relationship is formed; the full slice cannot pass until R10's domain-backed relation exists.

Recipient signs in or registers, returns to an invitation preview, sees inviter/project/role/access, accepts deliberately and reaches the permitted task. The inviter later returns and sees “Alex joined [project]” with a real accepted participation record; verified collaboration appears only after qualifying work. Record acceptance from the invitation row even if asynchronous event emission failed. Shared links contain no private tokens in analytics.

Scope one project invitation type and one contribution action, not generalized growth campaigns, social feeds or a recommendation engine. Preserve existing finance and evidence ownership. Stop expansion if participants cannot explain what acceptance grants, if Home fails to refresh, or if the shared Passport implies unsupported verification.

## V. Acceptance Criteria

These are proposed implementation/release gates. This audit does not claim they have passed.

| Gate | Pass condition |
|---|---|
| Truthful money and booking | Zero paid/confirmed messages from URL parameters alone; pending webhook, decline, cancellation and reload agree with authoritative independent states |
| Freshness and unavailable state | Relevant confirmed mutations and SSE/reconnect invalidate context and Communications; fetched state updates within 5s after event under test conditions; unavailable never displays as empty/all-clear |
| Session/action correctness | Pending, confirmed and already-started fixtures produce accurate copy and permitted destinations; exact record is reachable; selected-item counts not presented as total backlog |
| Accessibility | Four surfaces meet WCAG 2.2 AA applicable criteria: normal text ≥4.5:1, large text ≥3:1, required control/focus contrast ≥3:1; keyboard paths, visible/non-obscured focus, status announcements, target size and reflow tested. No claim based only on source colors |
| Layout and expression | No unintended horizontal overflow at 320px or 200% zoom; long names/locales do not hide actions; reduced-motion stops nonessential animation; creator artwork remains intact |
| Semantic governance | 100% of functional color uses on the four surfaces use approved tokens/primitives, with explicit artwork/brand exceptions; ≤7 type roles and approved spacing/radius scale; no new inline-style attribute matching |
| Print | Public Passport and Runsheet verified on A4/Letter with long fixtures; no clipped evidence/QR, no working controls printed, readable without forced background printing |
| Invitation | Fresh and existing account paths preserve intent, return to correct work and show access scope; expiry/replay/concurrency pass; generic acceptance never grants unstated membership |
| Recovery | Payment, upload, network, conflict, auth and permission fixtures preserve safe context, provide actionable recovery and produce no duplicate financial effects |
| Evidence | Future/cancelled/no-show work excluded from performed totals; profile completeness never marketed as verification; per-item provenance and timestamps match source; privacy preserved |
| Adoption/comprehension | Formative task thresholds in R met or failures resolved and retested; report raw participant counts; no claim of uplift from liking the visual style |
| Performance | Establish p50/p75 baseline first. Proposed target: usable core context ≤2.5s p75 on agreed midrange/mobile-network fixture, action feedback ≤100ms; no >10% regression against measured baseline. These are product targets, not measured results |
| Engineering | During implementation run relevant component/journey checks plus repository-required typechecks, API security/intelligence, web suite, build, secret scan and fresh-Postgres integration. Mutation-check load-bearing truth/recovery assertions and inspect CI separately from local green |
| Scope | Four-surface slice validated before expansion; second adoption slice requires a real contextual invitation relation; no unrequested financial or permission semantics changed |

The product standard is demonstrated when a user can accurately explain what happened, act without reconstructing state, show trustworthy work, bring a collaborator into the intended relationship and return to the right context. Those outcomes, rather than decorative richness, are the evidence of market value.
