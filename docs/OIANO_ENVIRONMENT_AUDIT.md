# OIANO — Environment Display & Global Experience Audit

**Date:** 2026-09-07 · **Commit audited:** `61633df` · **Scope:** `apps/web` (50 pages, 47 components, 55 routes)
**Status:** Audit only. No code was modified to produce this document.

---

## A. Verdict

OIANO's design system is a **document, not a product**. Twenty-one CSS custom
properties are defined in `index.css` and reproduced in `CLAUDE.md` as "design
tokens." The rendered application uses them **72 times**, against **2,094 raw hex
literals** in TSX — **3.3% adoption**. There are **332 distinct six-digit hex
values** in the frontend; **213 of them appear exactly once**.

That single ratio explains almost every other finding below. When there is no
shared surface to style, every page invents its own: eight competing near-blacks,
sixteen border radii, 138 distinct padding values, 44 font sizes.

More precisely — and this is the finding that reframes the rest — **OIANO does not
have one styling system with poor adoption. It has five, and no design system.**

| # | Mechanism | Scale |
|---|---|---|
| 1 | Tailwind utility classes | 2,706 `className` uses |
| 2 | Inline React style objects | 1,378 `style={{` blocks |
| 3 | Page-scoped `<style>` tags injected from TSX | **24 files** |
| 4 | Global `index.css` with hand-rolled namespaces | 1,032 lines, **53 prefixes** (`.pp-`, `.rs-`, `.ssb-`, `.onb-`, `.hub-`, `.login-`, …) |
| 5 | `artist-experience.css` retrofit layer | 336 lines, 35 `!important`, 11 inline-style selectors |

Mechanism 4 is the one that hides in the metrics. `PassportPage` and `RunsheetPage`
look *well-behaved* by the hex-literal measure — 2 and 0 failing colours
respectively — because each invented a private CSS namespace (`.pp-*`, `.rs-*`)
rather than sharing one. Fifty-three such namespaces is not fifty-three components;
it is fifty-three parallel design systems of one page each. The tidy pages and the
messy pages are the same problem expressed twice.

Mechanism 3 compounds it: 24 files render literal `<style>` elements into the
document, injecting **globally-scoped** rules at mount time with no scoping, no
deduplication across mounts, and no participation in the token layer.

And when a designer later tries to impose order across all of this, the only handle
left is the serialized inline style string — which is literally what happened, at
`apps/web/src/styles/artist-experience.css:131`:

    .artist-experience button[style*="background: rgb(90, 155, 203)"],
    .artist-experience button[style*="background: #5A9BCB"],

`artist-experience.css` reaches around the component tree and matches on the text
of `style` attributes, **eleven times**, backed by **35 `!important`**
declarations. This is a competent designer working correctly against an impossible
substrate. The file is not the problem; it is the diagnosis.

**The three findings that matter most, in order:**

1. **The product has no room, only doors.** OIANO's entire visual identity —
   the wordmark, the ringed-planet glyph, the signature universe, the rotating
   African market inlay — renders on exactly **one page**: `EnterPage`, the login
   screen. Once a creator is inside, there is no identity at all. Serious creative
   work cannot live in a place that only introduces itself at the threshold.
2. **The passport cannot be shown to anyone.** `PublicPassportPage` is the one
   artefact a creator sends to a label, a manager, or a festival. Its OIANO brand
   mark is set at **10px in `text-zinc-600` — 2.56:1 contrast**, less than half the
   WCAG AA floor. Its "SAVE EPK" button calls `window.print()`, and the codebase
   contains **zero `@media print` rules** across **seven** `window.print()` call
   sites. The document a creator uses to prove their career is hard to read on
   screen and broken on paper.
3. **The product speaks in telemetry, not in craft.** Roughly 400 of ~470 inline
   font sizes are **12px or smaller** (119 at 10px, 61 at 9px, 12 at 8px), with
   **271** uppercase transforms and **139** letter-spacing declarations. That is the
   visual register of a monitoring console. It reads as a system watching
   creatives, not a place creatives work.

None of these are taste disagreements. Each is a measured property of the tree
with a named consequence.

---

## B. Method and evidence base

Every number in this document was measured against the working tree at `61633df`,
not estimated. Contrast ratios were computed with the WCAG 2.x relative-luminance
formula, not eyeballed. Where a claim rests on a single file, the file and line are
cited so it can be checked or refuted.

| Measurement | What was counted | Result |
|---|---|---|
| Token adoption | `var(--` vs `#rrggbb` in `src/**/*.tsx` | 72 vs 2,094 |
| Colour drift | distinct 6-digit hex values | 332 distinct, 213 singletons |
| Styling mode | `style={{` vs `className=` | 1,378 vs 2,706 |
| Type scale | distinct inline `fontSize` values | 44 |
| Spacing scale | distinct inline `padding` strings | 138 |
| Radius scale | distinct inline `borderRadius` integers | 16 |
| Focus | `focus-visible` rules | 2 (one ARTIST-only) |
| Focus suppression | `outline: none` | 24 |
| Motion | `@keyframes` vs files honouring reduced motion | 76 vs 10 |
| Localization | `'en-US'` literals · i18n dependency | 29 · none |
| Print | `window.print()` call sites vs `@media print` rules | 7 vs 0 |
| Shell adoption | pages importing a shared shell | 11 of 50 |
| CSS namespaces | distinct `.prefix-` families in `index.css` | 53 |
| Injected stylesheets | files rendering a `<style>` element | 24 |
| Images | `<img>` elements vs `alt=` attributes | 22 vs 22 (100%) |

**What this audit could not measure.** No live screenshots were captured: the audit
ran without a seeded dev server against real data, so every visual claim below is
derived from source, not from pixels. Two consequences: (a) findings about
*rendered* contrast in composed states — a `text-zinc-600` label sitting on a
gradient card, say — are inferred from the declared colours and may be better or
worse in situ; (b) nothing here reflects real content lengths, so wrapping and
overflow behaviour is unassessed. Both gaps should be closed by a screenshot pass
against seeded data before the P1 work in section W begins. Neither affects the P0
findings, which are all structural.

---

## C. Identity vs decoration

**C1 — the identity layer has one consumer, and it is the door.**

| Component | Consumers |
|---|---|
| `EnterBrandLockup.tsx` | `EnterPage` only |
| `RingedPlanetGlyph.tsx` | `EnterBrandLockup`, `EnterPage` |
| `SignatureUniverse3D.tsx` | `EnterPage` only |
| `AfricanFlagInlay.tsx` | **none — dead code** |

Four identity components exist. Three render on the login screen. One renders
nowhere. Past `/enter`, OIANO is visually anonymous: a dark admin panel that could
belong to any vertical SaaS product.

This is the difference between decoration and identity. Decoration is applied at
the entrance to make a first impression. Identity is the consistent material of the
place — how a card is cut, how a number is set, what a confirmation feels like.
OIANO has the first and not the second, and section A explains why: with 3.3% token
adoption there is no shared material to *be* consistent in.

**C2 — the one piece of genuine identity work is unwired.**

`AfricanFlagInlay.tsx` cycles six markets (Sierra Leone, Nigeria, Ghana, South
Africa, Tanzania, DR Congo) and reshuffles the order on every mount, with a comment
explaining why: no market is a fixed default, so each gets equal first billing over
time. That is a real, thought-through identity decision — the kind of thing that
distinguishes a product with a point of view. It has zero imports. It ships as dead
CSS and dead JSX.

**Recommendation.** Identity belongs on the artefacts that leave the building — the
public passport, the studio page, the receipt, the printed EPK — before it belongs
on the login screen. Wire `AfricanFlagInlay` into the public passport's OIANO mark,
or delete it; leaving it built-but-dark is the worst of the three options.

**Severity:** P1 (C1), P2 (C2).
**Affected:** `src/pages/EnterPage.tsx`, `src/components/AfricanFlagInlay.tsx`, `src/pages/PublicPassportPage.tsx`.

---

## D. Cultural overcoding

**D1 — cultural signal is concentrated at the entrance and absent from the work.**

The identity layer is African-specific (the market inlay, the market list) and
appears only pre-authentication. Everything post-login defaults to Anglo-American
software convention: `'en-US'` in 29 places, `currency: 'USD'` in 5, no RTL
handling, no non-Latin type provision.

This is overcoding in the precise sense — the *marketing* surface carries heavy
cultural signal while the *working* surface carries none. A Nigerian producer sees a
flag on the way in and a US-formatted currency figure on the way through. The signal
reads as positioning rather than as service, which is the exact failure mode that
makes creatives distrust platforms built *about* them rather than *for* them.

**D2 — "Passport" is doing heavy cultural work the design does not support.**

The product's central metaphor is a travel document — an object with real weight for
creatives in the markets OIANO names, many of whom have first-hand experience of
visa refusal. The rendered passport (section U) is a 74-line page whose brand mark
fails contrast and whose export is broken. If the metaphor is kept, the artefact has
to earn it. If the artefact cannot be made to earn it, the metaphor should change.

**Recommendation.** Move cultural specificity *inward*: locale-correct dates and
currency in the working surfaces (section R), and the market inlay on the shared
artefact rather than the login screen. Leave the entrance quieter than it is.

**Severity:** P2 (D1), P1 (D2 — resolved by fixing the passport, section U).

---

## E. The three-layer environment model

The brief asks for a three-layer model. OIANO already has the skeleton of one — it
is simply unevenly built. Naming it makes the backlog in section W tractable.

| Layer | Owns | Today | Health |
|---|---|---|---|
| **1 · Shell** — the room | Persistent chrome, navigation, ambient state, identity | `GlobalChrome` (`App.tsx:95`), 5 components; `MaintenanceShell` for 11 pages | **Partial** |
| **2 · Surface** — the work | Page frame, hierarchy, density, containment | 39 of 50 pages hand-roll their own | **Absent** |
| **3 · Object** — the artefact | Cards, badges, figures, fields, the passport, the receipt | 47 components, 2 shared primitives | **Absent** |

**Layer 1 exists and is under-used.** `App.tsx:95` renders a real shell:
`EcosystemNetworkPanel`, `StudioStatusBar`, `ArtistStatusToggle`, `MobileBottomNav`,
`CommandPalette` — plus a route-transition wrapper that stamps `data-account-family`
and an `artist-route-*` class per surface. This is a genuinely good architecture. It
is also mostly inert (section T).

**Layer 2 is the missing floor.** Only the 11 `Maintenance*` pages import a shell.
The other 39 each construct their own page frame: 24 render their own `<header>` or
`<nav>`, 9 declare their own `minHeight: '100vh'`. Every one of those is a separate
opinion about margin, max-width, and background — which is the mechanical origin of
the eight near-blacks in section L.

**Layer 3 does not exist as a layer.** There is no `Card`, no `Button`, no `Field`,
no `Stat`. `Skeleton.tsx` and `StatusBadge.tsx` are the only two shared primitives in
a 47-component directory otherwise made of feature-specific panels —
`EcosystemNetworkPanel`, `NetworkExchangePanel`, `SessionInsightCard`,
`MaintenanceMetricCard`, `NetworkMetrics`, `SessionStats`: six separate takes on
"a number in a box."

**This ordering is the implementation sequence.** Layer 3 first (primitives have no
dependencies), then Layer 2 (a shell that composes them), then Layer 1 (identity
applied to a room that now exists). Attempting Layer 1 first is exactly what
produced `artist-experience.css`.

---

## F. Layer 1 — Shell

**F1 — there is no application shell for 39 of 50 pages.**

`MaintenanceShell` serves the 11 OIANO-admin pages and is the only shared frame in
the product. Creator Home, Passport, Projects, Booking, Calendar, Communications,
Pulse, Runsheet, Producer Home and the rest each begin from nothing.

Consequences that are already visible in the numbers: a page cannot be moved without
carrying its chrome; a global change (a nav item, a max-width, a background) is a
39-file edit; and there is no single place where identity, focus styling, skip links,
or a page-title contract could be applied once.

**F2 — the shell that does exist is not composable.** `GlobalChrome` renders five
siblings and returns `null` for chrome-free routes via a hardcoded path list plus
four `startsWith` checks (`App.tsx:97`). It layers *over* pages rather than wrapping
them, so it cannot own layout, spacing, or the document's landmark structure — only
overlays.

**Recommendation.** Introduce `AppShell` (Layer 2) that wraps the routed element and
owns: the page background, the content max-width, a `<main>` landmark, a skip link, a
page-title slot, and the focus baseline from section Q. Adopt it page by page. The
first four adoptions are the implementation slice in section W.

**Severity:** P1. **Affected:** `src/App.tsx:95-126`, all 39 non-Maintenance pages.

---

## G. Layer 2 — Surface

**G1 — page frames disagree on every dimension.**

With no shared frame, each page picks its own values. Measured across `src/**/*.tsx`:

- **138** distinct inline `padding` strings.
- **24** distinct `gap` values: `0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 18 20 22 24 28 38 52`.
- **16** distinct `borderRadius` values: `2 3 4 5 6 7 8 9 10 11 12 14 16 20 99 999`.

A spacing scale exists to make "the same" look the same across surfaces. A 24-step
gap scale that includes both 13 and 14, and both 99 and 999 for "fully round," is not
a scale — it is the absence of one. Two cards built a week apart by the same person
will not align.

**G2 — the largest surfaces are the least structured.** `PulseDashboard.tsx` is
**1,799 lines** with **238 hex literals** and **48** inline style blocks;
`BookingPage.tsx` 1,003; `DashboardPage.tsx` 831; `AdminDashboardPage.tsx` 799;
`PassportPage.tsx` 715. These are where composition should be strongest and where
there is least of it.

**Recommendation.** Fix the scale before the pages. A 6-step spacing scale
(`4 8 12 16 24 32`), a 3-step radius scale (`6 10 16` plus one pill token), and a
type scale from section J are ~40 lines of tokens; adopting them is then mechanical
and reviewable per page.

**Severity:** P1. **Affected:** all pages; worst in the five named above.

---

## H. Layer 3 — Object

**H1 — no shared primitives, so every card is bespoke.** 47 components, of which
`Skeleton.tsx` and `StatusBadge.tsx` are the only role-neutral primitives. There is
no `Card`, `Button`, `Input`, `Field`, `Stat`, `EmptyState`, `Dialog`, `Table`, or
`Toolbar`.

**H2 — six independent implementations of "a metric."** `NetworkMetrics`,
`SessionStats`, `SessionInsightCard`, `MaintenanceMetricCard`, `ArtistPassportCard`
and `EcosystemNetworkPanel` each implement their own labelled-figure treatment. Any
change to how OIANO presents a number is six edits, and the six will drift because
nothing forces them together.

**H3 — the retrofit layer is the proof.** Because there is no `Card`,
`artist-experience.css:190` styles cards by matching radius values in inline style
strings:

    .artist-experience [style*="border-radius: 10px"],
    .artist-experience [style*="borderRadius: 10"],
    .artist-experience [style*="border-radius: 12px"],
    .artist-experience [style*="borderRadius: 12"] { ... }

This works, is fragile in an obvious way (a card at radius 11 silently opts out),
and would be one class if a `Card` existed. `artist-experience.css` is 336 lines of
this — it should shrink to near-nothing as Layer 3 lands, and its line count is a
good progress metric for the work in section W.

**Severity:** P1. **Affected:** `src/components/*`, `src/styles/artist-experience.css`.

---

## I. Hierarchy

**I1 — hierarchy is carried by colour and weight, not by size.** With ~85% of inline
font sizes at 12px or below (section J), the type scale cannot express rank. What is
left is colour: `#c9a84c` gold and `#5a9bcb` blue for emphasis, zinc-500/600 for
everything demoted. That is why 410 uses of failing-contrast greys exist (section Q)
— dimming text is the only demotion tool available.

**I2 — no consistent page-title contract.** 24 pages render their own `<header>`;
there is no shared H1 treatment, and `artist-experience.css:107` has to reach for
`.artist-experience h1, .artist-experience h2` globally to impose one — and only for
ARTIST.

**Recommendation.** Establish rank with size and space first, colour second. A page
whose primary figure is 32px and whose supporting label is 13px does not need a
2.5:1 grey to say which is which.

**Severity:** P1.

---

## J. Density and type scale

**J1 — the product is set at monitoring-console density.** Distribution of inline
`fontSize` values, `src/**/*.tsx`:

| Size | Uses | | Size | Uses |
|---|---|---|---|---|
| 8px | 12 | | 14px | 13 |
| **9px** | **61** | | 15px | 6 |
| **10px** | **119** | | 16px | 15 |
| **11px** | **112** | | 18px | 5 |
| **12px** | **96** | | 20px | 10 |
| 13px | 59 | | 22px | 9 |
| | | | 28px / 32px | 4 / 3 |

**400 uses at 12px or below. 64 at 14px or above.** 44 distinct values in total.

WCAG sets no minimum font size, so this is not a conformance failure — it is a
product failure. 9px and 8px text is below the practical legibility floor for
sustained reading on any device, and it is used **73 times**. A creative professional
reading their own session history, their own earnings, or their own credits is
reading it at a size normally reserved for legal footers.

**J2 — the label register reinforces it.** **271** `uppercase` transforms and **139**
`letterSpacing` declarations. Small, tracked, uppercase, monospace labels are the
house style of telemetry dashboards. Applied across a product whose subject is
creative work, the effect is that the interface reads as instrumentation.

**Recommendation.** Adopt a 7-step scale — `12 / 13 / 15 / 17 / 21 / 28 / 40` — with
**15px as body**, and reserve 12px for genuine metadata. Retire 8px and 9px entirely.
Cut uppercase labels to section headers and status pills only.

**Severity:** P1. This is the single change that would most alter how OIANO feels.

---

## K. Cards and containment

**K1 — sixteen radii and eight surface colours means no card system.** Combined with
section L's eight near-blacks, a "card" in OIANO is any of roughly 40 combinations of
background, border, and radius.

**K2 — nesting is uncontrolled.** With no `Card` primitive there is no rule about
what may contain what, so nested panels stack borders and backgrounds — a card on
`#141414` inside a section on `#0f0f0f` inside a page on `#0a0a0a` produces three
near-identical greys separated by 1px borders that read as noise rather than
structure at the densities in section J.

**Recommendation.** Exactly three elevations — page, surface, raised — and a rule
that a raised card may not contain another raised card. Two radii plus a pill.

**Severity:** P1.

---

## L. Colour

**L1 — 332 distinct hex values; 213 used exactly once.** The most-used values:

| Hex | Uses | Role |
|---|---|---|
| `#5a9bcb` | 147 | primary blue (= `--dome`) |
| `#c9a84c` | 138 | gold (= `--gold`) |
| `#1e1e1e` | 65 | border |
| `#141414` | 55 | surface |
| `#2a2a2a` | 45 | muted |
| `#1a1a1a` | 44 | *undeclared* near-black |
| `#0a0a0a` | 38 | page background |
| `#1d9e75` | 36 | success green |
| `#3a3a3a` | 28 | *undeclared* |
| `#3b8bff` | 27 | **second blue** |
| `#0d0d0d` | 26 | *undeclared* near-black |
| `#f0ede8` | 18 | paper white |
| `#0f0f0f` | 17 | *undeclared* near-black |
| `#d94a4a` | 16 | **red A** |
| `#ef4444` | 15 | **red B** |

**Eight near-blacks** (`#0a0a0a #0d0d0d #0f0f0f #141414 #1a1a1a #1e1e1e #2a2a2a
#3a3a3a`), of which four are undeclared. **Two blues.** **Two reds** — and per
section Q they differ in whether they pass contrast, so which red a page happened to
pick determines whether its error message is accessible.

**L2 — the tokens are ignored where they exist.**

| Token | Value | `var()` uses | Literal uses |
|---|---|---|---|
| `--dome` | `#5A9BCB` | **3** | **147** |
| `--gold` | `#C9A84C` | (via `--live-accent`) | **138** |
| `--bougain` | `#D6567F` | **0** | 0 |
| `--channel-accent` | — | 1 | — |
| `--grain-opacity` | `0.028` | 1 | — |

`--dome` is named, documented, commented, and loses 147-to-3 to its own literal.
`--bougain` — annotated in `index.css:22` as *"rare — one alert, never a background"*
— has no consumers at all: a designed exception that no code ever takes.

**L3 — there is no light mode.** Zero `dark:` variants, no `prefers-color-scheme`
query, no `data-theme` attribute in `index.css`. The product is dark-only. That is a
legitimate choice for a studio tool — but it is not a choice that has been made, it
is one that was never faced, and section U shows where it breaks (print).

**Recommendation.** Collapse to 3 surfaces + 1 border + 2 text tones + 4 semantic
accents. Delete `--bougain` or use it. Pick one red (`#ef4444` — it passes) and one
blue.

**Severity:** P0 for the two-reds accessibility split; P1 for the rest.

---

## M. Typography

Three families are loaded: `DM Sans` (body), `JetBrains Mono` (data), `Playfair
Display` (display). The pairing is sound and matches `CLAUDE.md`.

**M1 — the display face is barely used.** Playfair appears in the identity layer and
little else; with 400 of 470 sizes at ≤12px there is no scale position where a
display serif can do work. The product loaded a voice and then gave it nothing to say.

**M2 — font stacks are duplicated in minified form.** Both `'DM Sans', sans-serif`
and `'DM Sans',sans-serif` occur, which defeats grep-based auditing and indicates the
stacks are being retyped rather than referenced. No `--font-body` / `--font-mono` /
`--font-display` tokens exist.

**Recommendation.** Add the three font tokens; give Playfair the top two steps of the
section J scale and nothing else.

**Severity:** P2.

---

## N. Iconography

**N1 — the icon system is healthy and is the best-behaved part of the visual layer.**
**102 distinct `lucide-react` icons** across **55 files**, one library, consistent
usage. Only **16** inline `<svg>` elements product-wide.

**N2 — two small leaks.** ~21 emoji appear in TSX as pictorial elements. Emoji render
differently per platform, carry cultural connotation that varies by locale (relevant
given section R), and are announced verbosely by screen readers. They should not sit
in the same slot as a lucide icon.

**N3 — no size discipline.** Icon sizes are passed per-call-site rather than drawn
from a scale, so icons drift out of alignment with the text they label.

**Recommendation.** Keep lucide as the sole source. Replace the emoji. Define three
icon sizes (14 / 16 / 20) bound to the type scale.

**Severity:** P3. Least urgent finding in this audit — noted because it is close to
correct and cheap to finish.

---

## O. Motion

**O1 — 76 `@keyframes` against 10 files honouring `prefers-reduced-motion`.** The
route-transition system (`page-enter`, `artist-route-enter`, `artist-content-reveal`,
`artist-image-reveal`, plus staggered `nth-child` delays at
`artist-experience.css:102-105`) animates on every navigation. Users who have asked
their OS to reduce motion get the full treatment on most surfaces.

`prefers-reduced-motion` is honoured in: `index.css` (7 blocks),
`EnterPage`, `RingedPlanetGlyph` (2), `AfricanFlagInlay.css`, `EnterBrandLockup.css`,
`ArtistPassportCard`, `SignatureUniverse3D`, `ProducerPassportPage`, `PulseDashboard`,
`artist-experience.css` (1). Concentrated in the identity layer — the decorative
animations are guarded and the functional ones largely are not.

**O2 — 65 inline `animation:` declarations in TSX** cannot be reached by a media
query at all, since inline styles win the cascade. Any animation declared inline is
structurally exempt from reduced-motion handling.

**Recommendation.** One global guard early in `index.css` reducing all durations to
~0.01ms under `prefers-reduced-motion: reduce`, plus migration of the 65 inline
animations to classes. The global guard alone is ~6 lines and fixes most of it.

**Severity:** P1 — this is a WCAG 2.2 concern (2.3.3 Animation from Interactions,
AAA; but 2.2.2 and vestibular-safety practice make it AA-adjacent in effect).

---

## P. Cultural inclusivity

**P1 — the visual system assumes a single cultural default it never states.**
`'en-US'` × 29, `USD` × 5, Latin-only type, no RTL, no non-Latin fallback stacks —
against a product that names Sierra Leone, Nigeria, Ghana, South Africa, Tanzania and
DR Congo as its markets.

Concretely: a Ghanaian creator's earnings render in `en-US` format; a name with
non-Latin characters has no declared fallback face; dates read `9/7/2026` in a market
that writes `7/9/2026`. Each is small; together they say the product was designed
elsewhere.

**P2 — emoji as UI carries locale-variable meaning** (section N2).

**P3 — what is done well:** the market-rotation logic in `AfricanFlagInlay` is a
genuinely thoughtful piece of inclusive design. It is unwired (C2).

**Severity:** P2. **Affected:** 29 call sites, `index.css` font stacks.

---

## Q. Accessibility — WCAG 2.2 AA

This section states conformance failures, not preferences. Ratios computed against
the three page backgrounds in use.

**Q1 — 410 uses of text colours that fail AA for normal text. (Fails 1.4.3.)**

| Colour | Uses | on `#0a0a0a` | on `#141414` | AA normal (4.5:1) |
|---|---|---|---|---|
| `text-zinc-600` `#52525b` | **225** | 2.56 | 2.38 | **FAIL** |
| `text-zinc-500` `#71717a` | **185** | 4.10 | 3.81 | **FAIL** |
| `#666666` | 38 | 3.45 | 3.21 | **FAIL** |
| `#d94a4a` (red A) | 22 | 4.74 | **4.41** | **FAIL on surface** |
| `#71717a` (literal) | 13 | 4.10 | 3.81 | **FAIL** |
| `#555b5f` (placeholder) | 2 | 2.87 | 2.67 | **FAIL at any size** |

`text-zinc-600` at 2.38:1 is the most-used demoted text colour in the product and
sits at roughly half the required ratio. `#555b5f` is the input-placeholder colour set
at `artist-experience.css:166` — placeholder text is where contrast matters most,
because it is the only instruction a user has before typing.

Note the red split: `#d94a4a` fails on `#141414` while `#ef4444` passes at 4.90. Two
undifferentiated reds means error styling is accessible or not depending on which
file it landed in.

Passing, for reference: `#5a9bcb` (6.13), `#c9a84c` (8.06), `#1d9e75` (5.44),
`#3b8bff` (5.55), `#f0ede8` (15.78) — the accent palette is fine. **The failure is
entirely in the demoted-text tier**, which is exactly what section I predicted:
dimming is the only hierarchy tool available, so it gets over-used past the floor.

**Q2 — focus is suppressed 24 times and restored twice. (Fails 2.4.7, and 2.4.11
Focus Not Obscured in 2.2.)** `outline: none` appears 24 times. There are exactly two
`focus-visible` rules in the entire product: one in `index.css`, one at
`artist-experience.css:147` — and the second only applies inside `.artist-experience`,
i.e. **only for ARTIST users**. A keyboard user in the STUDIO_ADMIN, ENGINEER,
PRODUCER or OIANO_ADMIN role has substantially less focus indication than an artist.

**Q3 — motion is unguarded on most surfaces. (See O1.)**

**Q4 — no skip link and no consistent landmark structure.** With no shell (F1), there
is no reliable `<main>`; 24 pages declare their own `<header>`. Keyboard and screen
reader users traverse the full nav on every page.

**Q5 — what is done well.** **22 of 22 `<img>` elements carry `alt`** — 100%
coverage, including the passport QR code, which is captioned meaningfully rather than
with a filename. 144 `aria-*` attributes and 73 explicit `role=` attributes are in
use. Someone has cared about this. The gaps above are structural rather than
neglectful — they are consequences of having no shared components to fix once.

**Severity:** **P0** for Q1 and Q2. These are the audit's hard conformance failures.

---

## R. Localization

**R1 — no i18n library is installed.** No `i18next`, `react-intl`, or `lingui` in
`package.json`. All copy is hardcoded English in TSX.

**R2 — 29 hardcoded `'en-US'` locales** in `Intl.DateTimeFormat` /
`Intl.NumberFormat` calls, and **5** hardcoded `currency: 'USD'`. `timeZone` appears
11 times, so timezone handling exists — locale handling does not.

**R3 — no RTL support.** Zero `dir` attributes. Layout is built on physical
properties (`padding-left`, `marginRight`) rather than logical ones.

**Assessment.** Full i18n is not warranted yet and should not be started now. But the
29 `'en-US'` literals are a five-line fix — a `formatDate` / `formatMoney` pair in
`src/lib/` reading the browser locale, with currency from the studio record rather
than a constant. That removes the wrong default without committing to a translation
pipeline.

**Severity:** P2.

---

## S. Device and performance

**S1 — responsive coverage is thin but present.** 9 `@media` queries in `index.css`,
170 responsive Tailwind prefixes across the tree, plus a dedicated `MobileBottomNav`.
The mobile story exists.

**S2 — `MobileBottomNav` is rendered globally but referenced by only two files**
(`App.tsx`, `CalendarPage.tsx`), so per-page mobile behaviour is otherwise
untested against the pages' hand-rolled frames (F1).

**S3 — 1,378 inline style objects are re-created on every render.** Each `style={{}}`
allocates a new object, defeating React's prop-equality bailout and forcing subtree
re-renders. On `PulseDashboard.tsx` (1,799 lines, 48 inline style blocks, live
polling) this is a measurable cost, not a theoretical one.

**S4 — `SignatureUniverse3D` on the entry route.** A 3D component on the login page is
the heaviest thing in the product and the first thing a user on a low-end Android
device over a slow connection meets. Not measured here — flagged for measurement.

**Severity:** P2 (S3), P3 (S2, S4 pending measurement).

---

## T. Role-based environments

**T1 — only one of five roles has an environment.** `artist-experience.css` is 336
lines defining atmosphere, type, focus, inputs, cards, scrollbars and route-level
glow for ARTIST. PRODUCER, ENGINEER, STUDIO_ADMIN and OIANO_ADMIN have none.

The consequence is uneven quality by role: an artist gets designed inputs, a focus
ring, and card treatment; a producer gets browser defaults on the same components.

**T2 — the hook for fixing this exists and is dead.** `App.tsx:125` stamps
`data-account-family={accountFamilyForRole(user?.role)}` on the route wrapper,
resolving to `ARTIST` / `CREATIVE_PROFESSIONAL` / `STUDIO` / `OIANO_PLATFORM`. The
function is implemented, unit-tested (`src/lib/accountArchitecture.test.ts`), and
correct.

**`data-account-family` has zero CSS consumers.** Not one rule in any stylesheet
selects on it. The role-differentiated environment system is fully wired up to
nothing.

This is the highest-leverage finding in the audit: the architecture for
role-differentiated environments is already built, tested, and shipping — it needs
CSS, not design. Renaming the `.artist-experience` rules to
`[data-account-family]` with per-family token overrides would extend a designed
environment to all five roles without new architecture.

**T3 — role branching is scattered.** 50 role comparisons across 16 files (ARTIST 23,
STUDIO_ADMIN 15, ENGINEER 5, PRODUCER 4, OIANO_ADMIN 3), each an inline
`role === '...'` string. No shared capability predicate.

**Severity:** P1 (T1/T2), P3 (T3).

---

## U. Public vs operational surfaces

This is where the audit's second-most-serious finding lives.

**U1 — the public passport is the product's most important artefact and its least
designed surface.**

| Surface | LOC | Inline styles | Hex literals |
|---|---|---|---|
| `PublicPassportPage.tsx` | **74** | 0 | 11 |
| `StudioPassportPage.tsx` | **50** | 0 | 3 |
| `EnterPage.tsx` | 198 | 22 | 27 |
| `PulseDashboard.tsx` | 1,799 | 48 | 238 |

The internal operations dashboard has **24× the code** of the page a creator shows to
a record label. OIANO's stated purpose is verified creative work; the passport is the
verification made visible; and it receives less design attention than any operational
screen in the product.

**U2 — the OIANO mark on the public passport fails contrast by a factor of ~1.8.**
`PublicPassportPage.tsx:37`:

    <span className="font-mono text-[10px] text-zinc-600 tracking-[.15em]">
      OIANO PASSPORT · {passport.passport_code}

`text-zinc-600` = `#52525b` = **2.56:1** on `#0a0a0a`, set at **10px**. The footer
attribution uses `text-zinc-700` = `#3f3f46` = **1.90:1**. The product's name, on the
one page where a stranger encounters it, is nearly invisible — and the sentence
asserting that the work was verified from OIANO records is the least legible text on
the page.

**U3 — "SAVE EPK" produces a broken document.** Seven `window.print()` call sites
(`PassportPage` ×3, `PublicPassportPage`, `ReceiptPage` ×2 — one auto-firing after
600ms — `RunsheetPage`), and **zero `@media print` rules** anywhere in
`src/**/*.css`. Printing a `#0a0a0a` page yields either an ink-flooded black sheet
or, with the browser's default background suppression, pale grey text on white at
around 1.3:1. Both are unusable.

The EPK is the artefact a creative sends to someone with power over their career. It
is currently generated by printing a dark dashboard.

**U4 — the identity layer is absent from every public surface** (section C1) and
present only on the login screen, which is the one surface no outsider sees.

**Severity:** **P0** for U2 and U3.

---

## V. Component inventory and tokens

**Inventory** — 47 components in `src/components/`, classified:

| Class | Count | Examples |
|---|---|---|
| Shared primitives | **2** | `Skeleton`, `StatusBadge` |
| Feature panels | ~30 | `EcosystemNetworkPanel`, `NetworkExchangePanel`, `ProjectActionPanel` |
| Metric variants | **6** | `NetworkMetrics`, `SessionStats`, `SessionInsightCard`, `MaintenanceMetricCard`, `ArtistPassportCard`, `EcosystemNetworkPanel` |
| Navigation | 3 | `MobileBottomNav`, `ProducerNav`, `MaintenanceShell` |
| Identity | 4 | `EnterBrandLockup`, `RingedPlanetGlyph`, `SignatureUniverse3D`, `AfricanFlagInlay` (dead) |

**Missing entirely:** `Button`, `Card`, `Input`, `Field`, `Select`, `Dialog`,
`Table`, `Tabs`, `Toolbar`, `EmptyState`, `Stat`, `PageHeader`.

**Tokens** — 21 CSS custom properties in `index.css`:

`--amber --amber-dim --bg --border --bougain --bougain-dim --brand-height
--channel-accent --channel-accent-dim --dome --dome-dim --gold --gold-dim
--gold-light --grain-opacity --live-accent --live-accent-dim --muted --signal
--surface`

**Adoption: 72 `var()` uses vs 2,094 hex literals — 3.3%.** No spacing tokens, no
radius tokens, no type tokens, no font-family tokens, no elevation tokens. The token
set covers colour only, and colour is where the drift is worst.

**V1 — 53 private CSS namespaces stand in for the missing component layer.**
`index.css` is 1,032 lines organised into 53 hand-rolled prefix families:

`.ssb-` (18 rules) `.rs-` (17) `.login-` (9) `.onb-` (8) `.oiano-` (8) `.sun-` (5)
`.ast-` (5) `.hub-` (4) `.console-` (4) `.page-` (3) `.signal-` (2) … plus `.pp-`,
defined *inside* `PassportPage.tsx` rather than in any stylesheet.

Each namespace is one page's private design system. This is why the hex-literal
metric misleads on `PassportPage` (2 failing colours) and `RunsheetPage` (0): those
pages are not more disciplined, they externalised their inline styles into a
namespace nobody else can use. The measure improved; the sharing did not.

**V2 — 24 files inject global CSS at mount.** `<style>` elements are rendered from
9 components (`Toast`, `Skeleton`, `CommandPalette`, `MobileBottomNav`, `ProducerNav`,
`SmartClock`, `ArtistPassportCard`, `SignatureUniverse3D`,
`StudioCircleConsentCenter`) and 15 pages. React does not scope these — they are
global rules whose lifetime is tied to a component's mount, which means style
availability depends on render order and route history. It also means the same rules
are parsed repeatedly across a session.

**Severity:** P1 (V1), P2 (V2).

---

## W. Permanent design principles, backlog, and first implementation slice

### W1 — Six principles to hold permanently

1. **A token beats a literal, always.** If a colour, size, space or radius is written
   twice, it is a token. Enforceable: a lint rule failing new hex literals in TSX.
2. **Three layers, built bottom-up.** Object → Surface → Shell. Never style a layer
   by reaching around it; if you need an attribute selector on an inline style
   string, the primitive underneath is missing.
3. **Legibility is not negotiable.** 4.5:1 minimum for text, 15px body, no 8px or 9px
   text anywhere. Hierarchy comes from size and space before colour.
4. **Every role gets a designed environment.** One role's experience is not the
   product's experience. `data-account-family` is the mechanism.
5. **What leaves the building is designed first.** The passport, the receipt, the
   studio page, the printed EPK outrank every internal dashboard. They are the
   product to everyone who is not a user.
6. **Accessibility is a build property, not a review step.** Focus visible by
   default, motion guarded globally, landmarks from the shell — so that the default
   path is the correct one and nobody has to remember.

### W2 — Prioritised backlog

**P0 — conformance and the outward artefact** *(the product is currently broken for
keyboard users, low-vision users, and anyone the passport is sent to)*

| # | Finding | Where | Fix |
|---|---|---|---|
| P0-1 | 410 uses of sub-4.5:1 text (Q1) | tree-wide | Retire `text-zinc-600`/`zinc-500` as text; two approved text tones |
| P0-2 | Focus suppressed 24×, restored twice, one ARTIST-only (Q2) | tree-wide | Global `:focus-visible` in `index.css`, before any role scoping |
| P0-3 | Public passport mark at 2.56:1/10px (U2) | `PublicPassportPage.tsx:37,70` | Raise size and tone |
| P0-4 | 7 print call sites, 0 print rules (U3) | all `.css` | One `@media print` sheet: light ground, dark ink, hide chrome |
| P0-5 | Two reds, one failing (L1/Q1) | tree-wide | Standardise on `#ef4444` |

**P1 — the environment itself**

| # | Finding | Where | Fix |
|---|---|---|---|
| P1-1 | No Layer 3 primitives (H1) | `src/components/` | `Card`, `Button`, `Stat`, `Field`, `PageHeader` |
| P1-2 | No `AppShell` for 39 pages (F1) | `App.tsx` + pages | Shell owning background, width, `<main>`, skip link |
| P1-3 | 44 font sizes, 400 uses ≤12px (J1) | tree-wide | 7-step scale, 15px body |
| P1-4 | 24 gaps / 16 radii / 138 paddings (G1) | tree-wide | 6-step space, 3-step radius |
| P1-5 | `data-account-family` has no CSS (T2) | `artist-experience.css` | Re-key role rules onto the attribute; extend to 5 roles |
| P1-6 | 76 keyframes, 10 guarded (O1) | `index.css` | One global reduced-motion guard |
| P1-7 | 8 near-blacks, 2 blues (L1) | tree-wide | 3 surfaces, 1 border, 4 accents |
| P1-8 | Identity absent past login (C1) | public surfaces | Mark on passport, studio page, receipt, print |
| P1-9 | 53 private CSS namespaces (V1) | `index.css`, `PassportPage.tsx` | Fold into primitives, namespace by namespace |

**P2** — locale/currency helpers (R2) · 6 metric components → one `Stat` (H2) ·
24 mount-time `<style>` injections (V2) · font-family tokens (M2) · inline-style
render cost (S3) · cultural signal moved inward (D1) · `AfricanFlagInlay` wired or
deleted (C2).

**P3** — icon size scale and emoji removal (N) · role-branching predicate (T3) ·
`SignatureUniverse3D` performance measurement (S4) · component tests for the new
primitives.

### W3 — First implementation slice

The brief asks for the smallest set of real changes demonstrating the upgraded
standard across several existing surfaces. This slice touches **four surfaces across
three roles and both the public and operational sides**, and lands every P0.

**Step 0 — foundation (no visual change; ~120 lines, all new).**
Extend `index.css` with space, radius, type and font tokens; add the global
`:focus-visible` rule (P0-2) and the global reduced-motion guard (P1-6); add the
`@media print` sheet (P0-4). Build five primitives — `Card`, `Button`, `Stat`,
`Field`, `PageHeader` — and `AppShell`. Nothing adopts them yet, so this step is
independently reviewable and independently revertable.

**Step 1 — Creator Home (`DashboardPage.tsx`, 831 LOC, ARTIST).**
Adopt `AppShell` + `PageHeader`; convert cards to `Card`; move the six metric
treatments to `Stat`; apply the type scale. This is the surface most creators see
most often, and it already consumes `/api/context`, so its data layer is settled —
only presentation changes.

**Step 2 — a Project surface (`ArtistProjectsPage.tsx`, ARTIST).**
Same primitives, second surface. This is what proves the primitives generalise rather
than having been fitted to one page. Any prop that has to be added here is a design
flaw found cheaply.

**Step 3 — Passport, public and private (`PublicPassportPage.tsx` 74 LOC +
`PassportPage.tsx` 715 LOC).**
Lands P0-3 and P0-4 on the artefact that matters most: legible OIANO mark, the
identity mark from C2, and an EPK that prints as a document rather than a screenshot
of a dashboard. It also retires the `.pp-*` namespace (V1) — the first proof that a
private design system can be folded back into the shared one. Smallest file in the
product, largest gain in the audit.

**Step 4 — one operational surface (`RunsheetPage.tsx`, 487 LOC, STUDIO_ADMIN +
ENGINEER).**
Chosen over `PulseDashboard` (1,799 LOC) deliberately, for four reasons: it is a
non-ARTIST surface, so it proves P1-5's `data-account-family` re-keying works for a
second role; it already has a print path, so P0-4 gets verified end to end; it owns
the second-largest private namespace (`.rs-`, 17 rules), so retiring it tests V1
against a real operational page; and at 487 lines it is reviewable. Pulse is the
right *second* operational surface, not the first.

**Evidence of success — measured, not asserted.** After the slice:

| Metric | Now (measured) | Target after slice |
|---|---|---|
| Sub-4.5:1 text uses on the five surfaces | **51** | **0** |
| — of which `ArtistProjectsPage` | 33 | 0 |
| — of which `PublicPassportPage` | 15 | 0 |
| `focus-visible` rules | 2 (one role-scoped) | 1 global + role extensions |
| `@media print` rules | 0 | ≥1, verified on the EPK |
| Distinct font sizes across the five surfaces | **21** | ≤7 |
| Pages using a shared shell | 11 / 50 | 16 / 50 |
| Private CSS namespaces retired (`.pp-`, `.rs-`) | 0 of 53 | 2 of 53 |
| `artist-experience.css` inline-style hacks | 11 | ≤7 |

That last row is the honest progress signal: the retrofit layer should shrink as the
real layer lands. When it reaches zero, the design system has stopped being a
document.

---

*Audit produced 2026-09-07 against `61633df`. No application code was modified.*
