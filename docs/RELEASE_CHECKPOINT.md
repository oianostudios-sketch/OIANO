# Oiano release checkpoint

Run the complete local release gate with:

```text
npm run verify
```

The command validates the Prisma schema, replays the generated database
baseline in an isolated temporary schema, runs security and financial tests,
and creates production API and web builds.

## Current checkpoint boundaries

The working tree contains several product streams. Before release, checkpoint
them separately so each change can be reviewed and rolled back independently:

1. Authentication, MFA and notification stream security.
2. Payment domain, webhook verification, ledger and refunds.
3. Artist dashboard, Passport, projects and booking experience.
4. Studio operator dashboard, Pulse, room state and Network Exchange.
5. Oiano maintenance, finance, health and audit surfaces.
6. Database baseline and migration release documentation.

## Known cleanup candidates

- `apps/web/src/components/OianoUniverse.tsx` is not imported. Preserve it until
  the new adaptive login renderer is visually accepted, then remove it in its
  own cleanup checkpoint.
- `MainStudioCard` and `StudioBCard` in `PulseDashboard.tsx` are exported but not
  rendered. Pulse now uses `DynamicRoomCard` with canonical API room data.
- The optional Three.js login renderer remains a large asynchronous chunk. It
  no longer blocks or downloads for mobile, reduced-motion or low-power users.

Do not combine dead-code deletion with database or payment changes.
