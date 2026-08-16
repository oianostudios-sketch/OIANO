import { app } from './app';
import { SINGLE_STUDIO_MODE } from '@oiano/shared';
import { registerClockActivityConsumer } from './services/clockActivityConsumer';
import { prisma } from './lib/prisma';

if (!SINGLE_STUDIO_MODE) {
  throw new Error('Multi-studio mode is not yet supported. Set SINGLE_STUDIO_MODE=true in shared/constants.ts');
}

async function assertSingleStudioInvariant() {
  // SINGLE_STUDIO_MODE is a code flag; this checks the data actually agrees
  // with it. Several routes assume one studio without a per-row scope check
  // (notably GET /api/artists, which has no studio filter at all — Artist
  // has no direct studio relation in the schema). If a second Studio row
  // ever exists while that code is unfixed, those routes leak data across
  // studios. Fail loudly at boot rather than silently, so this can't slip
  // in through a seed script or manual DB edit.
  const count = await prisma.studio.count();
  if (count > 1) {
    throw new Error(
      `SINGLE_STUDIO_MODE is true but ${count} Studio rows exist. Routes like ` +
      `GET /api/artists are not studio-scoped and will leak data across studios ` +
      `until that's fixed — refusing to start. Either remove the extra studio ` +
      `rows, or scope the unscoped routes and set SINGLE_STUDIO_MODE=false.`
    );
  }
}

registerClockActivityConsumer();

const PORT = process.env.PORT ?? 4000;

assertSingleStudioInvariant()
  .then(() => {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 OIANO API running on http://localhost:${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/health`);
      console.log(`🌍 Env: ${process.env.NODE_ENV ?? 'development'}`);
    });
  })
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });