import crypto from 'crypto';
import db from '../db';

/** Genera un OTP casuale a 6 cifre */
export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Salva l'OTP in DB (cancella prima quelli vecchi per la stessa email) */
export function saveOtp(email: string, token: string): void {
  db.prepare('DELETE FROM otp_tokens WHERE email = ?').run(email);
  const expiresAt = new Date(Date.now() + 60 * 1000).toISOString(); // 1 minuto
  db.prepare(
    'INSERT INTO otp_tokens (email, token, expires_at) VALUES (?, ?, ?)'
  ).run(email, token, expiresAt);
}

/** Valida l'OTP: controlla esistenza, scadenza e lo marca come usato */
export function validateOtp(email: string, token: string): boolean {
  const row = db.prepare(`
    SELECT id FROM otp_tokens
    WHERE email = ?
      AND token = ?
      AND used = 0
      AND expires_at > datetime('now')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(email, token) as { id: number } | undefined;

  if (!row) return false;

  db.prepare('UPDATE otp_tokens SET used = 1 WHERE id = ?').run(row.id);
  return true;
}
