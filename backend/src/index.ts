import express from 'express';
import cors from 'cors';
import './db'; // side-effect: schema, seed admin, cleanup OTP

import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import downloadRoutes from './routes/download';
import adminRoutes from './routes/admin';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({
    siteTitle: process.env.SITE_TITLE || 'InOut Contest',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/admin', adminRoutes);

// Multer / body size errors
app.use(
  (
    err: Error & { code?: string; status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File troppo grande' });
      return;
    }
    console.error('[Server] Errore non gestito:', err);
    res.status(err.status || 500).json({ error: err.message || 'Errore interno' });
  }
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Backend in ascolto su 0.0.0.0:${PORT}`);
});
