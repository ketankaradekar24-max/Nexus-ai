import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import accountRouter from './server/routes/account.ts';
import adminAndEvalsRouter from './server/routes/adminAndEvals.ts';
import builderRouter from './server/routes/builder.ts';
import codingAndDataRouter from './server/routes/codingAndData.ts';
import conversationsRouter from './server/routes/conversations.ts';
import filesRouter from './server/routes/files.ts';
import imagesRouter from './server/routes/images.ts';
import memoryRouter from './server/routes/memory.ts';
import projectsRouter from './server/routes/projects.ts';
import researchRouter from './server/routes/research.ts';
import voiceRouter from './server/routes/voice.ts';
import { attachLiveVoiceGateway } from './server/voiceLiveWs.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(express.json({ limit: '15mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down briefly.' },
  });
  app.use('/api/', apiLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'SUB AI',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', accountRouter);
  app.use('/api', conversationsRouter);
  app.use('/api', memoryRouter);
  app.use('/api', projectsRouter);
  app.use('/api', imagesRouter);
  app.use('/api', filesRouter);
  app.use('/api', researchRouter);
  app.use('/api', builderRouter);
  app.use('/api', voiceRouter);
  app.use('/api', codingAndDataRouter);
  app.use('/api', adminAndEvalsRouter);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachLiveVoiceGateway(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SUB AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SUB AI server:', err);
  process.exit(1);
});
