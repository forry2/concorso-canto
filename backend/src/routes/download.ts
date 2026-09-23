import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import db, { DATA_DIR } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/download/:userId
 * Scarica la base di un utente.
 * - Un utente può scaricare solo la propria base.
 * - Un admin può scaricare quella di qualsiasi utente.
 */
router.get('/:userId', (req: Request, res: Response) => {
  const targetId = parseInt(req.params.userId, 10);

  // Controllo accesso
  if (!req.user!.isAdmin && req.user!.userId !== targetId) {
    res.status(403).json({ error: 'Accesso negato' });
    return;
  }

  const upload = db.prepare(
    'SELECT filename, original_name FROM uploads WHERE user_id = ?'
  ).get(targetId) as { filename: string; original_name: string | null } | undefined;

  if (!upload) {
    res.status(404).json({ error: 'Nessuna base caricata per questo utente' });
    return;
  }

  const filePath = path.join(DATA_DIR, 'uploads', String(targetId), upload.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File non trovato sul server' });
    return;
  }

  // Usa il nome originale se disponibile, altrimenti il filename salvato
  const downloadName = upload.original_name || upload.filename;

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    console.error('[Download] Errore stream:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Errore durante il download' });
  });
  stream.pipe(res);
});

export default router;
