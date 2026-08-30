import { app } from './app';
import { registerClockActivityConsumer } from './services/clockActivityConsumer';
import { registerSseActivityBridge } from './services/sseActivityBridge';

registerClockActivityConsumer();
registerSseActivityBridge();

const PORT = process.env.PORT ?? 4000;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 OIANO API running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🌍 Env: ${process.env.NODE_ENV ?? 'development'}`);
});
