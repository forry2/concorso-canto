import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'db.sqlite'));

// Performance e integrità referenziale
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL COLLATE NOCASE,
    nome       TEXT NOT NULL DEFAULT '',
    cognome    TEXT NOT NULL DEFAULT '',
    canzone    TEXT NOT NULL DEFAULT '',
    presentazione TEXT NOT NULL DEFAULT '',
    is_admin   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS otp_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL COLLATE NOCASE,
    token      TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT,
    source_type   TEXT NOT NULL CHECK(source_type IN ('file','youtube')),
    youtube_url   TEXT,
    uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

try {
  db.exec('ALTER TABLE otp_tokens ADD COLUMN magic_token TEXT');
} catch {
  // colonna già presente
}
try {
  db.exec("ALTER TABLE users ADD COLUMN presentazione TEXT NOT NULL DEFAULT ''");
} catch {
  // colonna già presente
}
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uploads_user_id_unique ON uploads(user_id)');
} catch (err) {
  console.warn('[DB] Indice UNIQUE uploads non creato (possibili duplicati):', err);
}

// Seed admin iniziale da variabili d'ambiente
const adminEmail = process.env.ADMIN_EMAIL;
if (adminEmail) {
  const existing = db.prepare('SELECT id, is_admin FROM users WHERE email = ?').get(adminEmail) as any;
  if (!existing) {
    db.prepare(
      'INSERT INTO users (email, nome, cognome, canzone, is_admin) VALUES (?, ?, ?, ?, 1)'
    ).run(
      adminEmail,
      process.env.ADMIN_NOME || 'Admin',
      process.env.ADMIN_COGNOME || '',
      'Organizzatore'
    );
    console.log(`[DB] Admin creato: ${adminEmail}`);
  } else if (!existing.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(adminEmail);
    console.log(`[DB] Utente promosso ad admin: ${adminEmail}`);
  }
}

// Pulizia OTP scaduti ogni 5 minuti
setInterval(() => {
  const deleted = db.prepare("DELETE FROM otp_tokens WHERE expires_at < datetime('now') OR used = 1").run();
  if (deleted.changes > 0) {
    console.log(`[DB] Rimossi ${deleted.changes} OTP scaduti/usati`);
  }
}, 5 * 60 * 1000);

export default db;
export { DATA_DIR };
