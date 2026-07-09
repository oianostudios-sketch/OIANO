# OIANO Producer Space Prompt

## Who the producer is

A producer at Dreamz Music Lab is not a booking customer. They are a creative operator.
They bring artists in. They run projects across weeks or months. They think in phases —
tracked, edited, mixed, mastered, delivered. They work with multiple artists simultaneously
and their identity is their catalog, not a single session.

The system currently treats producers like artists who happen to book a lot.
That is wrong. The producer space needs to be rebuilt from the ground up.

---

## Role

Add PRODUCER to the role enum: `ARTIST | PRODUCER | STUDIO_ADMIN | ENGINEER`

A PRODUCER can:
- Book sessions on behalf of an artist project
- Create and manage projects (artist + phase + sessions)
- Upload beats, stems, project files per project
- See all their active projects in one board view
- Be discovered by artists searching for producers in their genre
- Have their own passport with a roster (artists worked with, genres produced)

A PRODUCER cannot:
- See other producers' projects or rosters
- Access admin analytics or wallet data for other artists
- Confirm or cancel bookings (admin-only)

---

## The Production Board — the permanent screen

This is the piece of art that lives on their screen.

Layout: full-width grid. Each column = one active project.
Each project column has: artist name (Playfair, prominent), current phase indicator,
last session timestamp, next booking if scheduled, a vertical phase progress strip.

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  NOVA REIGN     │  MALI BANKS     │  T-REXX         │  + New project  │
│  Tracking  ●    │  Mixing         │  Mastering       │                 │
│                 │                 │                  │                 │
│  ▓ Recorded     │  ▓ Recorded     │  ▓ Recorded      │                 │
│  ▓ Edited       │  ▓ Edited       │  ▓ Edited        │                 │
│  ● Tracking     │  ▓ Mixed        │  ▓ Mixed         │                 │
│  ░ Mixing       │  ● Mixing       │  ▓ Mastered      │                 │
│  ░ Mastering    │  ░ Mastering    │  ● Mastering     │                 │
│  ░ Delivered    │  ░ Delivered    │  ░ Delivered     │                 │
│                 │                 │                  │                 │
│  Last: 3 days   │  Last: today    │  Last: 1 week    │                 │
│  Next: Thu 2pm  │  Next: —        │  Next: Fri 11am  │                 │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

**Live state:** if an artist from one of their projects is in the studio right now,
that column glows — blue border, pulsing phase dot, "Live now" badge.

**Stale state:** if a project has had no session in 14+ days, the column dims.
Faint border. Grey phase strip. A "Needs attention" indicator.
The producer sees immediately what's moving and what's stalled.

**Color system for the board:**
- Active project, current phase: `#3B8BFF` (blue — control room feel)
- Live in studio now: `#C9A84C` (gold pulse)
- Completed phase: `#1D9E75` (teal — done)
- Pending phase: `#1e1e1e` (dark — not yet)
- Stale project: `#111` with muted text

---

## Project phases

```typescript
type ProjectPhase =
  | 'PRE_PRODUCTION'  // planning, beat selection
  | 'TRACKING'        // recording vocals/instruments
  | 'EDITING'         // comping, tuning, timing
  | 'MIXING'          // balance, FX, space
  | 'MASTERING'       // final loudness and format
  | 'DELIVERED'       // files sent to artist
```

Phase is set manually by the producer. Moving a phase is a one-tap action on the board.

---

## Producer Passport

Different from artist passport. Same card format, different data:

Left face (public):
- Producer name + alias
- Passport code (PROD-XXXX)
- Genres produced (gold chips)
- Signature sound tags (blue chips — "trap hi-hats", "soul samples", "live bass")
- Profile image

Right face (stats):
- Artists worked with: N
- Projects delivered: N
- Sessions at OIANO: N
- Hours in the room: N
- Member since: YEAR

The producer passport is discoverable by artists. An artist looking for a producer
can browse producer passports filtered by genre. This is the network effect mechanism.

---

## Producer stats strip (top of board)

```
Active projects: 3    Sessions this month: 8    Artists: 7    Hours: 64
```

Playfair numerals. Monospace labels. Always visible above the board.
These are career numbers — they should feel like they mean something.

---

## File workspace (per project)

Each project has a file workspace — beats, stems, rough mixes, finals.
Files are tagged to phases. A beat uploaded in PRE_PRODUCTION is separate from
a stem uploaded in TRACKING.

The producer can share a project workspace link with the artist — artist sees only
their project, not the producer's other work.

---

## Discovery (artist finds producer)

On the DiscoverPage, producers appear as a separate section below artists.
Each producer card shows:
- Name + alias
- Top 3 genres
- "X artists worked with · Y sessions"
- CTA: "View passport" → producer passport page

Artists can filter producers by genre. Producers can mark themselves as
"open to collabs" (default on) or "not taking new projects" (dims their card).

---

## Aesthetic and feel

The producer view should feel like a control room, not a bedroom studio app.

- Cooler temperature than artist view: blues and teals dominate, gold is accent only
- More monospace: producers are comfortable with data — timestamps, file sizes, phase codes
- Denser information: they track many things simultaneously; this is not a simplification
- The board should feel like Notion meets Ableton arrangement view
- Dark. Precise. Yours.

Typography:
- Playfair Display: project names, artist names, stat numbers
- JetBrains Mono: phases, timestamps, codes, file sizes
- DM Sans: labels, CTAs, secondary text

---

## Build order

1. Schema: add PRODUCER to role enum, create Project model (producer_id, artist_id, phase, title, notes)
2. API: CRUD for projects, producer passport endpoint, update discover to include producers
3. ProductionBoard component: the grid, phase strips, live/stale states
4. ProducerDashboardPage: board + stats strip + sidebar
5. Producer passport page: same shell as artist passport, different data
6. Discover integration: producer cards below artist cards

---

## The question for every producer-facing screen

> Does a producer opening this at 2am, three projects deep, know exactly
> what needs to happen tomorrow?

If not — redesign it.
