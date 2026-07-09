# OIANO StudioOS — AI Collaboration Prompt

Use this alongside CLAUDE.md and OIANO_PRODUCT_PROMPT.md.
CLAUDE.md = technical invariants. OIANO_PRODUCT_PROMPT.md = product vision.
This file = how to work on this codebase effectively without breaking things.

---

## The one rule that overrides everything else

**Never use Edit or Write tools for files longer than ~80 lines.**
The Edit tool injects null bytes or truncates silently. Files over ~80 lines must be
written with Python:

```python
open(path, 'w', encoding='utf-8').write(content)
```

For surgical single-line changes on short files, Edit is fine.
For everything else — append, reconstruct, rewrite — use Python or bash heredoc.
Always verify after: `wc -l <file>` and check the last 5 lines.

---

## File path translation (Cowork / bash sandbox)

| Tool context | Bash path |
|---|---|
| `C:\projects\oiano\` | `/sessions/<id>/mnt/oiano/` |
| outputs dir | `/sessions/<id>/mnt/outputs/` |
| uploads | `/sessions/<id>/mnt/uploads/` |

Always use the bash path inside `mcp__workspace__bash`. Always use the Windows path
for Read / Write / Edit tools.

---

## Verify before moving on

After every file change, run:

```bash
npx tsc --noEmit -p apps/api/tsconfig.json; echo "EXIT:$?"
npx tsc --noEmit -p apps/web/tsconfig.json; echo "EXIT:$?"
```

The only acceptable pre-existing error is:
`apps/api/tsconfig.json(26,5): error TS6053: File '...packages/shared' not found.`
Everything else must be zero before moving to the next task.

---

## Read before touching

Before modifying any file, read:
1. The file itself (full — not just the relevant section)
2. Any file it imports from that you plan to change
3. The route or component that calls it

The codebase is dense. Blind edits break imports silently.

---

## Patterns that work

### Adding a feature to an existing route file
1. Read the full file
2. Identify exact insertion point
3. Write complete replacement with Python (never append partial content)
4. TSC check

### Adding a new frontend component
1. Check if a similar component already exists (`grep -r ComponentName apps/web/src/`)
2. Use inline styles for one-off elements, Tailwind classes for layout
3. Never import raw axios — always `import { api } from '../lib/api'`
4. Never read auth token directly — always `useAuthStore()`

### Backend: adding a broadcast
1. Import `{ broadcastToUser, broadcastAll }` from `notifications.routes`
2. Call after the DB write succeeds, before `res.json()`
3. Payload must include `type`, relevant IDs, and any value the frontend toasts need
4. Fire-and-forget pattern for non-critical side effects:
   `somePromise.catch(() => {})` — never block the response

### React Query invalidation after mutations
Always invalidate in pairs:
- `['bookings']` + `['booking', id]` — for booking mutations
- `['bookings']` + `['availability']` — for anything that changes slots
- `['me']` — whenever wallet balance could have changed

---

## What each persona actually needs (test against these)

### Artist (role: ARTIST)
- Sees their own dashboard with next session prominent
- Books a session in under 4 taps on mobile
- Gets a real-time toast when studio confirms their booking
- Can view and download their session files from booking detail
- Profile passport is shareable and looks premium

### Engineer (role: ENGINEER)
- Sees today's sessions the moment they log in
- Can add session notes during a session
- Can mark a session delivered with file URLs
- Doesn't see admin financials or other artists' wallets

### Studio Operator (role: STUDIO_ADMIN)
- Command Centre (PulseDashboard) is the default view — live state at a glance
- Can confirm/reject pending bookings fast — bulk actions matter
- Runsheet is printable and accurate for the day
- Artist roster shows engagement temperature (who's active, who's gone cold)

---

## State machine: booking lifecycle

```
PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED
                     -> NO_SHOW
         -> CANCELLED
```

- PENDING: wallet NOT yet charged
- CONFIRMED: wallet IS charged (deducted in updateBookingStatus)
- Status changes broadcast SSE events to artist + all admin clients
- Email fires on CONFIRMED and COMPLETED (fire-and-forget)

---

## SSE event contract

| Event type | Payload fields | Frontend action |
|---|---|---|
| `booking_updated` | `bookingId`, `status` | invalidate booking queries + status toast |
| `session_delivered` | `bookingId` | invalidate booking + "files ready" toast |
| `wallet_updated` | `newBalance`, `delta` | invalidate `['me']`, `['wallet']` + balance toast |
| `new_message` | `bookingId`, `senderName` | invalidate messages + message toast |
| `connected` | `userId` | (no action — connection handshake) |

---

## Known truncation victims (files that have been truncated before)

These files have been corrupted by Edit tool calls in past sessions.
Always rewrite them fully with Python — never use Edit on them:

- `apps/api/src/routes/artists.routes.ts`
- `apps/api/src/routes/admin.routes.ts`
- `apps/web/src/pages/ArtistProfilePage.tsx`
- `apps/web/src/pages/PulseDashboard.tsx`
- `apps/web/src/pages/DashboardPage.tsx`

After touching any of these, check:
```bash
python3 -c "
path = '/sessions/.../file.ts'
c = open(path,'rb').read()
print('Size:', len(c), 'Last 100:', repr(c[-100:]))
"
```

---

## Things that are already done — do not rebuild

| Feature | Location |
|---|---|
| SSE real-time notifications | `notifications.routes.ts` + `useSSE.ts` |
| Wallet top-up via Stripe | `payments.routes.ts` |
| File upload (multer + R2) | `files.routes.ts` |
| AI summary with caching | `artists.routes.ts` + `ai-summary.service.ts` |
| Profile strength calculator | `passport.routes.ts` (calcProfileStrength) |
| Booking conflict check | `bookings.controller.ts` |
| Pagination on list endpoints | `artists.routes.ts`, `bookings.controller.ts` |
| Mobile bottom nav (ARTIST) | `MobileBottomNav.tsx` — Home/Book/Passport/Discover |
| Error boundary on profile | `ArtistProfilePage.tsx` (ArtistProfileErrorBoundary) |
| Skeleton on profile load | `ArtistProfilePage.tsx` (ArtistProfileSkeleton) |
| Wallet gate on /book | `BookingPage.tsx` — intercepts $0 balance |
| Post-booking → detail page | `BookingPage.tsx` onSuccess navigate |

---

## When something is broken and you don't know why

1. Check if the file is truncated: `wc -l` + check last 10 lines
2. Check for null bytes: `python3 -c "print(open(path,'rb').read().count(0))"`
3. Run TSC — it usually points exactly at the line
4. Read the actual error from the API: `grep -n "throw\|AppError\|next(err)" <file>`
5. Check the route is mounted in `app.ts`
6. Check the auth middleware is applied (authenticate vs requireRole)

---

## Design tokens (never hard-code colours inline — use these)

```
--gold:       #C9A84C   (primary brand, CTAs, active states)
--amber:      #E8823A   (warnings, live session, hot states)
--teal:       #1D9E75   (success, available, confirmed)
--blue:       #3B8BFF   (Studio B accent, info)
--bg:         #0a0a0a   (page background)
--surface:    #141414   (card background)
--border:     #1e1e1e   (default border)
--muted:      #2a2a2a   (disabled, placeholder bg)
```

Typography hierarchy:
- Playfair Display — display text, names, big numbers, brand moments
- DM Sans — body copy, labels, UI text
- JetBrains Mono — data, codes, times, passport codes, financial figures

---

## Session start checklist

When beginning a new session on this codebase:
1. Read CLAUDE.md (invariants)
2. Read this file (how to work)
3. Read OIANO_PRODUCT_PROMPT.md only if doing product/design work
4. Run TSC on both apps to establish a clean baseline before touching anything
5. Ask: what persona does this change serve, and does it improve their core loop?

---

## The question before every feature

> Does this make an artist book faster, an engineer run sessions better,
> or an operator understand their studio more clearly?

If the answer is no — it's not the next thing to build.
