import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db, { DATA_DIR } from '../db';
import { requireAuth } from '../middleware/auth';
import { checkFileOnDisk } from '../services/filecheck';
import { startYtdlpDownload, ytdlpJobs, cancelYtdlpJob } from '../services/ytdlp';

const router = Router();

// Tutte le route richiedono autenticazione
router.use(requireAuth);

// ------------------------------------------------------------------
// Helper: aggiorna o inserisce il record upload per un utente
// ------------------------------------------------------------------
function upsertUpload(
  userId: number,
  filename: string,
  originalName: string | null,
  sourceType: 'file' | 'youtube',
  youtubeUrl: string | null
): void {
  const existing = db.prepare('SELECT id FROM uploads WHERE user_id = ?').get(userId) as { id: number } | undefined;
  if (existing) {
    db.prepare(`
      UPDATE uploads
      SET filename = ?, original_name = ?, source_type = ?, youtube_url = ?, uploaded_at = datetime('now')
      WHERE user_id = ?
    `).run(filename, originalName, sourceType, youtubeUrl, userId);
  } else {
    db.prepare(`
      INSERT INTO uploads (user_id, filename, original_name, source_type, youtube_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, filename, originalName, sourceType, youtubeUrl);
  }
}

// ------------------------------------------------------------------
// Helper: elimina tutti i file fisici nella cartella di un utente
// ------------------------------------------------------------------
function clearUserUploadDir(userId: number): void {
  const dir = path.join(DATA_DIR, 'uploads', String(userId));
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignora */ }
    }
  }
}

// ------------------------------------------------------------------
// Configurazione Multer (storage su disco, limite 500 MB)
// ------------------------------------------------------------------
const MAX_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || '500') * 1024 * 1024;

function buildMulterStorage(getTargetUserId: (req: Request) => number) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const userId = getTargetUserId(req);
        const dir = path.join(DATA_DIR, 'uploads', String(userId));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '';
        cb(null, `base_incoming${ext}`);
      },
    }),
    limits: { fileSize: MAX_BYTES },
  });
}

// ------------------------------------------------------------------
// POST /api/upload  — upload file (utente carica la propria base)
// ------------------------------------------------------------------
const selfUpload = buildMulterStorage((req) => req.user!.userId);

router.post('/', selfUpload.single('file'), async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  // --- Caso 1: link YouTube ---
  if (req.body?.youtubeUrl) {
    const url = String(req.body.youtubeUrl).trim();
    if (!url.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//)) {
      res.status(400).json({ error: 'URL YouTube non valido' });
      return;
    }

    // Annulla eventuali job precedenti e cancella record DB
    cancelYtdlpJob(userId);
    clearUserUploadDir(userId);
    db.prepare('DELETE FROM uploads WHERE user_id = ?').run(userId);

    startYtdlpDownload(
      userId,
      url,
      (_outputPath) => {
        // Completato: aggiorna DB
        upsertUpload(userId, 'base.mp4', null, 'youtube', url);
        console.log(`[Upload] yt-dlp completato per utente ${userId}`);
      },
      () => {
        console.log(`[Upload] yt-dlp fallito per utente ${userId}`);
      }
    );

    res.status(202).json({
      message: 'Download YouTube avviato. Usa /api/upload/status per monitorare.',
      status: 'processing',
    });
    return;
  }

  // --- Caso 2: upload file ---
  if (!req.file) {
    res.status(400).json({ error: 'Nessun file ricevuto. Usa il campo "file" o "youtubeUrl".' });
    return;
  }

  const tmpPath = req.file.path;

  // Controlla magic bytes
  const check = checkFileOnDisk(tmpPath);
  if (!check.valid) {
    fs.unlinkSync(tmpPath);
    res.status(400).json({
      error: 'Formato file non supportato. Carica un file audio o video valido (mp3, mp4, wav, flac, ogg, mkv, avi…)',
    });
    return;
  }

  // Cancella job YouTube in corso (se presente)
  cancelYtdlpJob(userId);

  // Rimuovi file precedenti
  const userDir = path.join(DATA_DIR, 'uploads', String(userId));
  for (const f of fs.readdirSync(userDir)) {
    if (f !== path.basename(tmpPath)) {
      try { fs.unlinkSync(path.join(userDir, f)); } catch { /* ignora */ }
    }
  }

  // Rinomina da base_incoming{ext} a base{ext}
  const ext = path.extname(req.file.originalname).toLowerCase() || '.bin';
  const finalPath = path.join(userDir, `base${ext}`);
  fs.renameSync(tmpPath, finalPath);

  // Aggiorna DB
  upsertUpload(userId, `base${ext}`, req.file.originalname, 'file', null);

  res.json({
    message: 'File caricato con successo!',
    filename: `base${ext}`,
    mime: check.mime,
  });
});

// ------------------------------------------------------------------
// GET /api/upload/status — stato conversione YouTube
// ------------------------------------------------------------------
router.get('/status', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const job = ytdlpJobs.get(userId);

  if (!job) {
    // Nessun job attivo: controlla se c'è già un upload
    const upload = db.prepare('SELECT uploaded_at FROM uploads WHERE user_id = ?').get(userId) as
      | { uploaded_at: string }
      | undefined;
    res.json({
      status: upload ? 'done' : 'idle',
      message: upload ? 'Base già caricata' : 'Nessuna conversione in corso',
    });
    return;
  }

  res.json(job);
});

// ------------------------------------------------------------------
// GET /api/upload/my — informazioni sull'upload corrente dell'utente
// ------------------------------------------------------------------
router.get('/my', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const upload = db.prepare(`
    SELECT u.filename, u.original_name, u.source_type, u.youtube_url, u.uploaded_at
    FROM uploads u WHERE u.user_id = ?
  `).get(userId) as
    | { filename: string; original_name: string | null; source_type: string; youtube_url: string | null; uploaded_at: string }
    | undefined;

  if (!upload) {
    res.json({ upload: null });
    return;
  }

  // Verifica che il file esista fisicamente
  const filePath = path.join(DATA_DIR, 'uploads', String(userId), upload.filename);
  const fileExists = fs.existsSync(filePath);

  res.json({
    upload: {
      ...upload,
      fileExists,
    },
  });
});

// ------------------------------------------------------------------
// Esporta helper upsertUpload per uso nelle route admin
// ------------------------------------------------------------------
export { upsertUpload, clearUserUploadDir, buildMulterStorage, MAX_BYTES };

export default router;
