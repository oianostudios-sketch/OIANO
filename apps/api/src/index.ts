import { app } from './app';
import { SINGLE_STUDIO_MODE } from '@oiano/shared';
import { registerClockActivityConsumer } from './services/clockActivityConsumer';

if (!SINGLE_STUDIO_MODE) {
  throw new Error('Multi-studio mode is not yet supported. Set SINGLE_STUDIO_MODE=true in shared/constants.ts');
}

registerClockActivityConsumer();

const PORT = process.env.PORT ?? 4000;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 OIANO API running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🌍 Env: ${process.env.NODE_ENV ?? 'development'}`);
});