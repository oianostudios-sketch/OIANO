# OIANO Artist Experience Prompt

## The principle

The artist is not a user of this platform. The artist IS the platform.
Everything OIANO does — booking, passport, sessions, files, discovery —
exists to serve the artist's creative life. Every screen they touch should
reflect that they are the talent, not the customer.

When in doubt: would a world-class studio receptionist say this?
If not, rewrite it.

---

## The language register

Not corporate SaaS. Not too casual. Creative professional — warm, direct, specific.

| Current | Better |
|---|---|
| "Session booked — pending studio confirmation" | "You're in. We'll confirm your slot shortly." |
| "CONFIRMED" | "Confirmed" |
| "PENDING" | "Awaiting confirmation" |
| "COMPLETED" | "Session complete" |
| "NO_SHOW" | "Missed session" |
| "Book a Session" | "Reserve your time" |
| "Insufficient wallet balance" | "Add funds to secure this session" |
| "Loading artist profile..." | (skeleton — no text at all) |
| "Your Artist Passport starts here" | "Your creative identity starts here" |
| "Get my free Artist Passport →" | "Create my Artist Passport →" |

Rule: never use ALL_CAPS status labels in UI copy. They're for code, not for people.

---

## The five moments that define the artist experience

### 1. First booking
The artist has never booked here before. This is an initiation.
- The wizard should acknowledge this: "First session — let's make it count."
- On confirmation: not a toast and a redirect — a full confirmation screen.
  Show the room, the date, the time. Make it feel real.
- The artist should feel: *this is happening.*

### 2. Booking confirmed (admin approves)
The highest-stakes moment. The artist has been waiting.
- SSE toast fires: "Your session is confirmed — see you in the studio." ✅ (done)
- But: the BookingDetailPage should visually transform on CONFIRMED status.
  Gold border. Confirmed badge that feels earned, not just a label change.
- The artist should feel: *I'm in.*

### 3. Night before / morning of
The artist opens the app the day before or day of their session.
- Dashboard should lead with a pre-session card: room, time, engineer, what to bring.
- If wallet is below the session cost: surface it now, not at the door.
- The artist should feel: *I'm prepared.*

### 4. Session files delivered
The engineer has uploaded the session files.
- SSE toast: "Your session files are ready — open the booking to download." ✅ (done)
- BookingDetailPage should have a dedicated "Your Files" section, not buried in a list.
- Timestamp of delivery. Name of engineer. Download all button.
- The artist should feel: *my work is safe.*

### 5. Passport milestone
Profile strength hits 100%, or the artist reaches session count milestones (5, 10, 25).
- Surface this on the dashboard — not a notification badge, a real moment.
- "Your passport is complete. You're fully discoverable on OIANO."
- The artist should feel: *I've arrived.*

---

## What the dashboard should answer, in order

An artist opens the app. In under 3 seconds they should know:

1. Do I have a session soon? (next session card, prominent, with countdown)
2. Is my wallet funded? (balance visible, top-up one tap away if low)
3. Has anything changed on my bookings? (SSE-driven — no refresh needed)
4. What's my creative identity here? (passport strength, a chip or two)

Everything else is secondary. Remove what doesn't serve these four.

---

## The journey strip

Artists should feel their history with the studio. On the dashboard or passport page,
show a simple timeline or stat set that accumulates meaning over time:

- Sessions at Dreamz: 12
- Hours recorded: 47
- Member since: 2024
- Rooms used: Main Studio, Studio B

These numbers should animate on load (the counter animation already exists — use it).
This is not vanity — it's identity. An artist with 50 sessions here is a different person
than one with 2. The platform should know the difference and show it.

---

## Mobile is the primary surface for artists

Artists are not at desks. They're in transit, in the booth, at home at midnight.
Every artist-facing screen must work at 390px wide before it works at 1440px.

Priority order for mobile:
1. Next session card (full width, top of dashboard)
2. Wallet balance + top-up
3. Book button (one tap from anywhere via bottom nav)
4. Passport / identity

The sidebar, the data tables, the admin-style layouts — none of that for artists.
Single column. Big touch targets. Fast.

---

## Tone by context

**Pre-session (anticipation):**
Warm, specific, slightly exciting.
"Tomorrow at 2pm — Main Studio with Marcus. You're ready."

**Confirmation (green light):**
Direct, affirming, no filler.
"Confirmed. See you Thursday."

**Post-session (reflection):**
Quiet, complete, respectful of what just happened.
"Session complete. Your files will be ready within 24 hours."

**Error / can't proceed (friction):**
Honest, non-blaming, solution-first.
"You need $45 more to secure this session. Top up your wallet to continue."

**Empty states (nothing yet):**
Inviting, not apologetic.
"No sessions yet — your first one starts here." with a Book button.

---

## What to never do

- Never show raw IDs or UUIDs to artists
- Never use developer-speak: "API error", "500", "null", "undefined"
- Never make an artist feel like a guest in the system — they own their data
- Never hide the passport code — it's identity, show it proudly
- Never use a modal where a page works better
- Never auto-redirect away from a confirmation moment — let them read it

---

## The creative DNA is the differentiator

No other studio booking system asks an artist who they are creatively.
The genres, themes, vocal type, energy profile — this is the moat.

Surface it everywhere it makes sense:
- Passport page (already done ✅)
- Artist profile page (already done ✅)
- BookingDetailPage: show the artist's top genre chips next to their name
- Discover page: match by DNA overlap, not just recency
- Admin roster: DNA chips in the artist row for quick read

The more DNA appears in context, the more the artist feels seen.

---

## The question for every artist-facing screen

> If this artist just played the best set of their life and opened OIANO immediately after,
> would this screen feel worthy of that moment?

If not — redesign it.
