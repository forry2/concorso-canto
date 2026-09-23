import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import db, { DATA_DIR } from '../db';
import { requireAdmin } from '../middleware/auth';
import { checkFileOnDisk } from '../services/filecheck';
import { startYtdlpDownload, ytdlpJobs, cancelYtdlpJob } from '../services/ytdlp';
import { upsertUpload, clearUserUploadDir, buildMulterStorage } from './upload';

const router = Router();
router.use(requireAdmin);

// ------------------------------------------------------------------
// GET /api/admin/users
// Lista tutti gli utenti con stato upload
// ------------------------------------------------------------------
router.get('/users', (_req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT
      u.id, u.email, u.nome, u.cognome, u.canzone, u.is_admin, u.created_at,
      up.filename, up.original_name, up.source_type, up.youtube_url, up.uploaded_at
    FROM users u
    LEFT JOIN uploads up ON up.user_id = u.id
    ORDER BY u.cognome ASC, u.nome ASC
  `).all() as Array<{
    id: number; email: string; nome: string; cognome: string; canzone: string;
    is_admin: number; created_at: string;
    filename: string | null; original_name: string | null; source_type: string | null;
    youtube_url: string | null; uploaded_at: string | null;
  }>;

  const result = users.map((u) => ({
    id: u.id,
    email: u.email,
    nome: u.nome,
    cognome: u.cognome,
    canzone: u.canzone,
    isAdmin: u.is_admin === 1,
    createdAt: u.created_at,
    upload: u.filename
      ? {
          filename: u.filename,
          originalName: u.original_name,
          sourceType: u.source_type,
          youtubeUrl: u.youtube_url,
          uploadedAt: u.uploaded_at,
          fileExists: fs.existsSync(
            path.join(DATA_DIR, 'uploads', String(u.id), u.filename)
          ),
        }
      : null,
    ytdlpStatus: ytdlpJobs.get(u.id) || null,
  }));

  res.json({ users: result });
});

// ------------------------------------------------------------------
// POST /api/admin/users — Aggiunge un nuovo utente
// ------------------------------------------------------------------
router.post('/users', (req: Request, res: Response) => {
  const { email, nome, cognome, canzone, isAdmin } = req.body;

  if (!email || !nome || !cognome || !canzone) {
    res.status(400).json({ error: 'Email, nome, cognome e canzone sono obbligatori' });
    return;
  }

  try {
    const result = db.prepare(
      'INSERT INTO users (email, nome, cognome, canzone, is_admin) VALUES (?, ?, ?, ?, ?)'
    ).run(
      email.trim().toLowerCase(),
      nome.trim(),
      cognome.trim(),
      canzone.trim(),
      isAdmin ? 1 : 0
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ user });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Email già registrata' });
    } else {
      res.status(500).json({ error: 'Errore interno' });
    }
  }
});

// ------------------------------------------------------------------
// PUT /api/admin/users/:id — Modifica un utente esistente
// ------------------------------------------------------------------
router.put('/users/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { email, nome, cognome, canzone, isAdmin } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Utente non trovato' });
    return;
  }

  try {
    db.prepare(`
      UPDATE users
      SET email = ?, nome = ?, cognome = ?, canzone = ?, is_admin = ?
      WHERE id = ?
    `).run(
      email?.trim().toLowerCase(),
      nome?.trim(),
      cognome?.trim(),
      canzone?.trim(),
      isAdmin ? 1 : 0,
      id
    );

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({ user: updated });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Email già in uso da un altro utente' });
    } else {
      res.status(500).json({ error: 'Errore interno' });
    }
  }
});

// ------------------------------------------------------------------
// DELETE /api/admin/users/:id — Elimina un utente e la sua base
// ------------------------------------------------------------------
router.delete('/users/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    res.status(404).json({ error: 'Utente non trovato' });
    return;
  }

  // Cancella job yt-dlp in corso
  cancelYtdlpJob(id);

  // Elimina file fisici
  const userDir = path.join(DATA_DIR, 'uploads', String(id));
  if (fs.existsSync(userDir)) {
    fs.rmSync(userDir, { recursive: true, force: true });
  }

  // Elimina utente (CASCADE elimina anche uploads)
  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  res.json({ message: 'Utente eliminato' });
});

// ------------------------------------------------------------------
// GET /api/admin/download-all — ZIP con tutte le basi caricate
// ------------------------------------------------------------------
router.get('/download-all', async (req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT u.id, u.nome, u.cognome, u.canzone, up.filename
    FROM users u
    INNER JOIN uploads up ON up.user_id = u.id
    WHERE up.filename IS NOT NULL
    ORDER BY u.cognome ASC, u.nome ASC
  `).all() as Array<{ id: number; nome: string; cognome: string; canzone: string; filename: string }>;

  const usersWithFiles = users.filter((u) =>
    fs.existsSync(path.join(DATA_DIR, 'uploads', String(u.id), u.filename))
  );

  if (usersWithFiles.length === 0) {
    res.status(404).json({ error: 'Nessuna base disponibile per il download' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="basi-concorso-${new Date().toISOString().slice(0, 10)}.zip"`
  );

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('[Admin] Errore archiver:', err);
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);

  for (const u of usersWithFiles) {
    const filePath = path.join(DATA_DIR, 'uploads', String(u.id), u.filename);
    const safeName = `${u.cognome}_${u.nome}_${u.canzone}`
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_ -]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);
    const ext = path.extname(u.filename);
    archive.file(filePath, { name: `${safeName}${ext}` });
  }

  await archive.finalize();
});

// ------------------------------------------------------------------
// POST /api/admin/upload/:userId — Admin carica base per un utente
// ------------------------------------------------------------------
const adminUpload = buildMulterStorage((req) => parseInt(req.params.userId, 10));

router.post('/upload/:userId', adminUpload.single('file'), async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.userId, 10);

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!targetUser) {
    res.status(404).json({ error: 'Utente non trovato' });
    return;
  }

  // --- Caso 1: link YouTube ---
  if (req.body?.youtubeUrl) {
    const url = String(req.body.youtubeUrl).trim();
    if (!url.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//)) {
      res.status(400).json({ error: 'URL YouTube non valido' });
      return;
    }

    cancelYtdlpJob(targetId);
    clearUserUploadDir(targetId);
    db.prepare('DELETE FROM uploads WHERE user_id = ?').run(targetId);

    startYtdlpDownload(
      targetId,
      url,
      (_outputPath) => {
        upsertUpload(targetId, 'base.mp4', null, 'youtube', url);
        console.log(`[Admin] yt-dlp completato per utente ${targetId}`);
      },
      () => {
        console.log(`[Admin] yt-dlp fallito per utente ${targetId}`);
      }
    );

    res.status(202).json({ message: 'Download YouTube avviato', status: 'processing' });
    return;
  }

  // --- Caso 2: upload file ---
  if (!req.file) {
    res.status(400).json({ error: 'Nessun file ricevuto' });
    return;
  }

  const tmpPath = req.file.path;
  const check = checkFileOnDisk(tmpPath);
  if (!check.valid) {
    fs.unlinkSync(tmpPath);
    res.status(400).json({ error: 'Formato file non supportato. Carica un file audio o video valido.' });
    return;
  }

  cancelYtdlpJob(targetId);

  const userDir = path.join(DATA_DIR, 'uploads', String(targetId));
  for (const f of fs.readdirSync(userDir)) {
    if (f !== path.basename(tmpPath)) {
      try { fs.unlinkSync(path.join(userDir, f)); } catch { /* ignora */ }
    }
  }

  const ext = path.extname(req.file.originalname).toLowerCase() || '.bin';
  const finalPath = path.join(userDir, `base${ext}`);
  fs.renameSync(tmpPath, finalPath);

  upsertUpload(targetId, `base${ext}`, req.file.originalname, 'file', null);

  res.json({ message: 'File caricato con successo!', filename: `base${ext}`, mime: check.mime });
});

// ------------------------------------------------------------------
// GET /api/admin/ytdlp-status/:userId
// ------------------------------------------------------------------
router.get('/ytdlp-status/:userId', (req: Request, res: Response) => {
  const targetId = parseInt(req.params.userId, 10);
  const job = ytdlpJobs.get(targetId);
  res.json(job || { status: 'idle', message: 'Nessuna conversione in corso' });
});

export default router;
