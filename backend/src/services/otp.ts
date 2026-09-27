import crypto from 'crypto';
import db from '../db';

/** Genera un OTP casuale a 6 cifre */
export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Formatta una Date in stringa SQLite UTC: YYYY-MM-DD HH:MM:SS */
function toSqliteUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/** Salva l'OTP in DB (cancella prima quelli vecchi per la stessa email). Restituisce il token del link magico. */
export function saveOtp(email: string, token: string): string {
  db.prepare('DELETE FROM otp_tokens WHERE email = ?').run(email);
  const expiresAt = toSqliteUtc(new Date(Date.now() + 3 * 60 * 1000)); // 3 minuti
  const magicToken = crypto.randomBytes(32).toString('base64url');
  db.prepare(
    'INSERT INTO otp_tokens (email, token, magic_token, expires_at) VALUES (?, ?, ?, ?)'
  ).run(email, token, magicToken, expiresAt);
  return magicToken;
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

/** Consuma un link magico monouso e restituisce l'email, se ancora valido. */
export function consumeMagicToken(magicToken: string): string | null {
  const row = db.prepare(`
    SELECT id, email FROM otp_tokens
    WHERE magic_token = ?
      AND used = 0
      AND expires_at > datetime('now')
    LIMIT 1
  `).get(magicToken) as { id: number; email: string } | undefined;

  if (!row) return null;

  db.prepare('UPDATE otp_tokens SET used = 1 WHERE id = ?').run(row.id);
  return row.email;
}
