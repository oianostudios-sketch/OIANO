# OIANO StudioOS

Studio management platform for **Dreamz Music Lab** — Artist Passports, bookings, payments, AI briefs.

## Quick start

### 1. Prerequisites
- Node.js 20+
- Docker (for Postgres)
- pnpm or npm

### 2. Database
```bash
docker-compose up -d
```

### 3. Environment
```bash
cp .env.example apps/api/.env
# Edit DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
```

### 4. Install & migrate
```bash
npm install
cd apps/api && npx prisma generate && npx prisma migrate dev --name init
npx ts-node ../../prisma/seed.ts
cd ../..
```

### 5. Run
```bash
npm run dev
```

API → http://localhost:4000  
Web → http://localhost:5173  
Prisma Studio → `npm run db:studio`

## Demo logins
| Role | Email | Password |
|------|-------|----------|
| Studio Admin | admin@dreamzmusiclab.com | admin123 |
| Artist | demo@artist.com | artist123 |

## API
`GET /health` — health check  
See `CLAUDE_CODE_PROMPT.md` for full API surface.

## Phase roadmap
- **Phase 1** ✅ Auth, Passport, Bookings, AI Brief
- **Phase 2** 🔲 Stripe checkout, file uploads, notifications
- **Phase 3** 🔲 Greep Pay, email (Resend), mobile nav
- **Phase 4** 🔲 Docker deploy, E2E tests, production hardening
