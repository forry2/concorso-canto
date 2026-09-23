import { execFile, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export type YtdlpJobStatus = {
  status: 'processing' | 'done' | 'error';
  message: string;
};

// Mappa in memoria: userId → stato conversione (ephemeral, va bene per singola istanza)
export const ytdlpJobs = new Map<number, YtdlpJobStatus>();

// Mappa in memoria: userId → processo figlio (per poterlo killare)
const ytdlpProcesses = new Map<number, ChildProcess>();

/** Cancella un job yt-dlp in corso per userId, se presente */
export function cancelYtdlpJob(userId: number): void {
  const proc = ytdlpProcesses.get(userId);
  if (proc) {
    proc.kill('SIGTERM');
    ytdlpProcesses.delete(userId);
  }
  ytdlpJobs.delete(userId);
}

/**
 * Avvia il download YouTube in background.
 * Ritorna immediatamente; aggiorna ytdlpJobs al termine.
 * Il chiamante è responsabile di aggiornare il DB alla callback onComplete.
 */
export function startYtdlpDownload(
  userId: number,
  url: string,
  onComplete: (outputPath: string) => void,
  onError: () => void
): void {
  // Cancella eventuali job precedenti
  cancelYtdlpJob(userId);

  const userDir = path.join(DATA_DIR, 'uploads', String(userId));
  fs.mkdirSync(userDir, { recursive: true });

  // Rimuovi file esistenti
  for (const f of fs.readdirSync(userDir)) {
    try { fs.unlinkSync(path.join(userDir, f)); } catch { /* ignora */ }
  }

  const outputPath = path.join(userDir, 'base.mp4');

  ytdlpJobs.set(userId, { status: 'processing', message: 'Connessione a YouTube...' });

  const args = [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '-o', outputPath,
    url,
  ];

  const child = execFile('yt-dlp', args, { timeout: 10 * 60 * 1000 });
  ytdlpProcesses.set(userId, child);

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    ytdlpProcesses.delete(userId);

    if (code === 0 && fs.existsSync(outputPath)) {
      ytdlpJobs.set(userId, { status: 'done', message: 'Conversione completata!' });
      onComplete(outputPath);
    } else {
      // Pulizia file parziali
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch { /* ignora */ }
      }

      const isProtected =
        stderr.includes('copyright') ||
        stderr.includes('403') ||
        stderr.includes('Private video') ||
        stderr.includes('not available') ||
        stderr.includes('removed by');

      const message = isProtected
        ? 'Video non scaricabile: potrebbe essere protetto da copyright, privato o non disponibile.'
        : 'Errore durante il download. Verifica che il link sia corretto e che il video sia pubblico.';

      ytdlpJobs.set(userId, { status: 'error', message });
      onError();
    }
  });
}
