# OIANO StudioOS — Codex Master Prompt (Corrected)

You are building **OIANO StudioOS**, a studio management platform for **Dreamz Music Lab**.
This is a TypeScript monorepo. Read every file before modifying. Never break existing imports.

---

## Stack

- **API**: Express + Prisma + PostgreSQL + Zod + JWT (port **4000**)
- **Web**: React 18 + **Vite** + TailwindCSS + React Query + Zustand + React Router v6 (port **5173**, proxied to 4000)
- **Shared**: `packages/shared/src/constants.ts`

---

## Repo structure

```
oiano-studioos/
├── apps/api/src/
│   ├── app.ts                  # Express app — webhook route MUST be mounted before express.json()
│   ├── index.ts                # Server entry — startup assertions live here
│   ├── controllers/            # auth, bookings
│   ├── routes/                 # auth, artists, bookings, studio, availability,
│   │                           #   passport, admin, payments, webhooks
│   ├── middleware/             # auth.middleware.ts, error.middleware.ts
│   ├── lib/                    # prisma.ts, errors.ts, passport.ts, env.ts
│   └── services/               # ai-summary.service.ts
├── apps/web/src/
│   ├── App.tsx                 # Routes
│   ├── pages/                  # LoginPage, SignupPage, DashboardPage,
│   │                           #   ArtistProfilePage, BookingPage, AdminDashboardPage
│   ├── components/             # SmartClock (receives sessions prop — see §SmartClock)
│   ├── store/                  # auth.store.ts (Zustand + persist)
│   └── lib/
│       └── api.ts              # Shared axios instance with auth interceptor — ALWAYS use this
├── prisma/
│   ├── schema.prisma           # Full 15-model schema
│   └── seed.ts                 # Dreamz Music Lab seed (demo creds only — rotate before staging)
└── packages/shared/src/
    └── constants.ts            # SINGLE_STUDIO_MODE, DEFAULT_STUDIO_SLUG
```

---

## Invariants (enforce in every task)

1. API on port **4000**. Frontend on port **5173**.
2. All booking queries scope to `WHERE studio.slug = 'dreamz-music-lab'`.
3. Auth: JWT in `Authorization: Bearer <token>` header.
4. Roles: `ARTIST | STUDIO_ADMIN | ENGINEER`.
5. Zod validates **all** request bodies — no raw `req.body` access.
6. `AppError(message, statusCode)` for all thrown errors.
7. `error.middleware.ts` catches `ZodError` and `AppError`.
8. **Never** import raw `axios` in page/component files — always use `lib/api.ts`.
9. **Never** read or write auth tokens directly in page/component files — use `useAuthStore()`.
10. All env vars in Vite frontend use `import.meta.env.VITE_*` — **never** `process.env.REACT_APP_*`.

---

## API surface (all implemented)

```
POST   /api/auth/signup                          → creates User + Artist + Passport + Wallet
POST   /api/auth/login                           → returns { token, user }
GET    /api/auth/me                              (auth)
GET    /api/passport                             (auth, ARTIST)
PATCH  /api/passport/profile                     (auth, ARTIST) — recalculates profile_strength
GET    /api/studio
GET    /api/availability      ?date=YYYY-MM-DD&room_id=<number>
GET    /api/bookings          (auth)             — supports ?page=&limit=
POST   /api/bookings          (auth, ARTIST)     — guards wallet.balance >= session cost
GET    /api/bookings/:id      (auth)
PATCH  /api/bookings/:id/status (auth, STUDIO_ADMIN) — scoped to DEFAULT_STUDIO_SLUG
GET    /api/artists           (auth, STUDIO_ADMIN) — supports ?sort=created_at&order=desc&limit=
GET    /api/artists/:id       (auth)
GET    /api/artists/:id/summary (auth)           — cached; regenerates only if profile changed
POST   /api/artists/:id/files (auth, ARTIST)     — multer + S3/R2 upload
GET    /api/admin/analytics   (auth, STUDIO_ADMIN) — returns todays_bookings[], revenue, counts
POST   /api/notifications                        — internal; called after booking confirmed
POST   /api/payments/stripe/checkout-session     (auth)
POST   /api/webhooks/stripe                      — raw body; mounted BEFORE express.json()
```

---

## Critical backend patterns

### app.ts — webhook must come first

```ts
// CORRECT — raw body for Stripe signature verification
app.use(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  webhookRouter,
);
// Everything else gets parsed JSON
app.use(express.json());
app.use('/api', allOtherRouters);
```

### env.ts — hard-fail on missing secrets

```ts
// CORRECT — never use ?? 'fallback' for secrets
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL env var is required');
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY env var is required');
if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET env var is required');

export const JWT_SECRET = process.env.JWT_SECRET;
// ... etc
```

### index.ts — startup assertions

```ts
import { SINGLE_STUDIO_MODE } from '@oiano/shared/constants';
if (!SINGLE_STUDIO_MODE) throw new Error('Multi-studio mode not yet supported');
```

### Availability route — Zod query validation

```ts
const AvailabilityQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room_id: z.coerce.number().int().positive(),
});
// Use .parse(req.query) — missing or non-numeric room_id returns clean 400
```

### Booking creation — wallet balance guard

```ts
// In POST /api/bookings controller, before prisma.booking.create()
const wallet = await prisma.wallet.findUnique({ where: { artist_id: artistId } });
if (!wallet || wallet.balance < sessionCost) {
  throw new AppError('Insufficient wallet balance', 402);
}
```

### Booking status update — studio scope

```ts
// PATCH /api/bookings/:id/status — always scope by studio slug
const booking = await prisma.booking.findFirst({
  where: { id: params.id, studio: { slug: DEFAULT_STUDIO_SLUG } },
});
if (!booking) throw new AppError('Booking not found', 404);
```

### AI summary — cache on Passport model

```ts
// Schema addition needed:
// Passport { ai_summary String? ai_summary_updated_at DateTime? }

// In GET /api/artists/:id/summary
const passport = await prisma.passport.findUnique({ where: { artist_id: id } });
const profileUpdated = passport?.updated_at ?? new Date(0);
const summaryAge = passport?.ai_summary_updated_at ?? new Date(0);

if (passport?.ai_summary && summaryAge > profileUpdated) {
  return res.json({ summary: passport.ai_summary }); // serve cache
}
// ... call AI service, then persist result back to passport
```

### profile_strength calculator

```ts
// Call this utility inside PATCH /api/passport/profile after saving
export function calcProfileStrength(passport: Passport): number {
  const fields = [
    passport.bio, passport.genres?.length, passport.vocal_type,
    passport.creative_dna, passport.social_links, passport.profile_image_url,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}
```

### Pagination — all list endpoints

```ts
// Apply to GET /api/artists and GET /api/bookings
const { page = '1', limit = '50' } = req.query;
const take = Math.min(Number(limit), 100); // cap at 100
const skip = (Number(page) - 1) * take;
const items = await prisma.booking.findMany({ take, skip, orderBy: { created_at: 'desc' } });
```

---

## Critical frontend patterns

### NEVER do this in any page or component

```ts
// ❌ Wrong — bypasses interceptor, duplicates auth logic, wrong env prefix
import axios from 'axios';
const API = process.env.REACT_APP_API_URL ?? 'http://localhost:5001';
const token = localStorage.getItem('oiano-api-token');
axios.get(`${API}/api/bookings`, { headers: { Authorization: `Bearer ${token}` } });
```

### Always do this

```ts
// ✅ Correct — shared instance handles auth header and 401 refresh automatically
import { api } from '@/lib/api';
const { data } = await api.get('/api/bookings');
```

### Auth store — logout must clear persisted storage

```ts
// auth.store.ts
logout: () => {
  set({ user: null, token: null });
  useAuthStore.persist.clearStorage(); // clears persisted token
},
```

### React Query — invalidate both bookings AND availability after mutation

```ts
const mutation = useMutation({
  mutationFn: (data) => api.post('/api/bookings', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['availability'] }); // ← required
  },
});
```

### Vite env vars — always VITE_ prefix

```ts
// .env
VITE_API_URL=http://localhost:4000
VITE_DEMO_ADMIN_EMAIL=admin@dreamzmusiclab.com
VITE_DEMO_ADMIN_PASSWORD=admin123

// Usage
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
```

### vite.config.ts — proxy with WebSocket support

```ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true, // required for future notification websocket
      },
    },
  },
});
```

### SmartClock — must receive session data

```tsx
// DashboardPage.tsx — pass todaysSessions to SmartClock
<SmartClock
  size={300}
  sessions={todaysSessions}   // ← required for timeline rendering
  showLegend={false}
  showStatusBar
/>
```

### DashboardPage — use analytics endpoint for aggregates

```ts
// Fetch aggregated data from analytics endpoint instead of computing client-side
const { data: analytics } = useQuery({
  queryKey: ['analytics'],
  queryFn: () => api.get('/api/admin/analytics').then(r => r.data),
});
// analytics.todays_bookings → pass to SmartClock
// analytics.revenue_due, analytics.pending_payments → use in Metric components
```

---

## Canonical Session type (lock this — remove all fallback fields)

```ts
// Match exactly what the API returns — no optional alternatives
export interface Booking {
  id: string;
  title: string | null;
  starts_at: string;           // always present — required at creation
  ends_at: string;             // always present — required at creation
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID';
  payment_amount: number;
  artist: { id: string; name: string; alias: string | null };
  room: { id: string; name: string; room_type: string; status: string } | null;
  service: { id: string; name: string } | null;
  project: { id: string; title: string; status: string } | null;
  engineer: { id: string; name: string } | null;
  notes: string | null;
}
```

---

## Demo credentials (seed only — rotate before any staging deploy)

Passwords are set by `SEED_*_PASSWORD` in `.env` / `apps/api/.env`, which
override the fallbacks below when present — check those files first if a
login fails. As of this seed run:

- Admin:     `admin@dreamzmusiclab.com` / `DreamzAdmin2026!` (SEED_ADMIN_PASSWORD)
- Artist:    `demo@artist.com` / `DreamzArtist2026!` (SEED_ARTIST_PASSWORD)
- Engineer:  `engineer@dreamzmusiclab.com` / `DreamzEngineer2026!` (SEED_ENGINEER_PASSWORD)
- Producer:  `producer@dreamzmusiclab.com` / `producer123` (SEED_PRODUCER_PASSWORD, root `.env` only — falls back to seed.ts's own `producer123` default either way)

Fallback defaults if no `SEED_*_PASSWORD` is set anywhere: `admin123` / `artist123` / `engineer123` / `producer123` (see `prisma/seed.ts`).

---

## Design tokens

```css
--gold:        #C9A84C;
--gold-light:  #E2C97E;
--bg:          #0a0a0a;
--surface:     #141414;
--border:      #1e1e1e;
--muted:       #2a2a2a;
```

```
font-display: Playfair Display
font-body:    DM Sans
font-mono:    JetBrains Mono
```

---

## Open tasks (implement in order)

```
[P0] Fix Dashboard.tsx:
     - Replace raw axios + getAuthToken() with lib/api.ts + useAuthStore()
     - Replace all process.env.REACT_APP_* with import.meta.env.VITE_*
     - Fix fallback port from 5001 → 4000 (then remove fallback; use VITE_API_URL)
     - Remove all Session type field alternatives; use canonical Booking type
     - Pass todaysSessions to SmartClock
     - Call GET /api/admin/analytics for aggregates

[P0] Fix app.ts: mount webhook route before express.json()
[P0] Fix env.ts: hard-throw on missing JWT_SECRET and other secrets
[P0] Add wallet balance guard in POST /api/bookings

[P1] Add Zod query validation to GET /api/availability
[P1] Add studio scope to PATCH /api/bookings/:id/status
[P1] Fix auth.store.ts logout() to call persist.clearStorage()
[P1] Invalidate ['availability'] in booking mutation onSuccess

[P2] Add pagination to GET /api/artists and GET /api/bookings
[P2] Add ai_summary + ai_summary_updated_at to Passport schema; implement caching
[P2] Add profile_strength calculator; call from PATCH /api/passport/profile
[P2] Add startup assertion for SINGLE_STUDIO_MODE in index.ts
[P2] Add ws: true to Vite proxy config

[P3] Wire up Stripe real checkout (POST /api/payments/stripe/checkout-session)
[P3] Add POST /api/artists/:id/files (multer + S3/Cloudflare R2)
[P3] Add POST /api/notifications (called from booking confirmed event)
[P3] Artist onboarding wizard: 3-step flow post-signup
[P3] Mobile: replace sidebar with bottom nav for ARTIST role
[P3] Add barrel exports (index.ts) to controllers/ directory
[P3] Add loading skeletons and error boundaries to ArtistProfilePage
```

---

## Common controller pattern

```ts
export async function myHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = MySchema.parse(req.body);
    const result = await prisma.something.create({ data });
    res.status(201).json(result);
  } catch (err) {
    next(err); // error.middleware handles ZodError and AppError
  }
}
```

## Common React Query pattern

```tsx
const { data, isLoading, isError } = useQuery({
  queryKey: ['key'],
  queryFn: async () => (await api.get('/endpoint')).data,
});

if (isLoading) return <Skeleton />;
if (isError)   return <ErrorBoundary />;
```