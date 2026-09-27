# Concorso di Canto — InOut Contest

Web app per caricare le basi karaoke dei partecipanti. Stack: Next.js (frontend) + Express (backend) + SQLite su volume locale, via Docker Compose.

## Architettura sul Raspberry Pi

```
Internet → nginx host (:443, SSL, vhost)
              ↓
         frontend :3001 (Next.js)
              ↓ /api → rewrite
         backend :4000 (solo rete Docker)
              ↓
         ./data/  (db.sqlite + uploads/)
```

Nginx host deve fare proxy del vhost `concorso-canto.robybrown.duckdns.org` a `http://127.0.0.1:3001`.

## Setup

1. Copia le variabili d'ambiente:

```bash
cp .env.example .env.production
```

Compila almeno: `EMAIL_*`, `JWT_SECRET`, `ADMIN_EMAIL` / `ADMIN_NOME` / `ADMIN_COGNOME`, `NEXT_PUBLIC_SITE_URL`.

2. Avvia:

```bash
docker compose up --build -d
```

3. Apri `http://localhost:3001` (o il dominio dietro nginx).

Al primo avvio l'admin in `ADMIN_EMAIL` viene creato automaticamente. Login con OTP via email (valido 1 minuto).

## Sviluppo locale (senza Docker)

Terminal 1 — backend:

```bash
cd backend && npm ci && npm run dev
```

Terminal 2 — frontend (proxy API verso localhost:4000):

```bash
cd frontend && npm ci
set BACKEND_URL=http://localhost:4000
npm run dev
```

## Funzionalità

- Login email + OTP (anti-enumeration)
- Partecipanti: upload file A/V o link YouTube (yt-dlp → mp4), una base per utente (overwrite)
- Admin: lista partecipanti, CRUD allowlist, upload per conto terzi, ZIP di tutte le basi

## Dati

Persistono in `./data/` (gitignored). Backup: copia quella cartella.
