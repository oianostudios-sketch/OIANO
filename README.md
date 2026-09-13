# OIANO

OIANO is a Creative Work Network. People start creative work, find the people and
places it needs, agree terms, settle what is owed and build a professional record
from evidence. Identity is issued by OIANO; studios are organizations on the network.

- Working on the code, as a person or an agent: read [AGENTS.md](AGENTS.md) first.
- Which documents are current: [docs/README.md](docs/README.md).

## Run it locally

You need Node 24 (22 or later works), npm, and PostgreSQL 14 or later command-line
tools. Nothing here uses the database named in `.env`.

```bash
npm ci
```

```bash
npx prisma generate
```

```bash
npm run dev:local
```

`dev:local` starts a private PostgreSQL in `.oiano/`, migrates and seeds a local
database, and runs the API and the web app, on http://localhost:4000 and
http://localhost:5173 unless other dev servers hold those ports, in which case it
picks the next free ones and prints them. Demo accounts are defined in
`prisma/seed.ts`.

## Check your work

| Check | Command |
|---|---|
| Typecheck | `npm run typecheck --workspace=apps/api` and `npm run typecheck --workspace=apps/web` |
| API unit and web suites | `npm test` |
| Integration suite on a fresh database | `npm run test:integration:local` |
| Build | `npm run build` |
| Secrets | `npm run security:secrets` |
