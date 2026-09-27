# Piano: Web App Concorso di Canto

## Obiettivo

Creare una nuova web application per la gestione delle basi musicali di un concorso di canto, ospitata sullo stesso Raspberry Pi di `sempliceAssociazione`. Architettura Docker Compose con frontend Next.js + TailwindCSS e backend Node.js/Express. Persistenza su SQLite (senza DB server). Il progetto vivrà in `/Users/rbruni/.gemini/antigravity/scratch/concorso-canto/`.

---

## Architettura Generale

```
Internet → nginx host (porta 443, SSL)
               ↓ HTTP proxy
          container: frontend (Next.js, porta 3000)
               ↓ API calls (http://backend:4000)
          container: backend (Express, porta 4000)
               ↓ (file system)
          volume: ./data/  (SQLite + uploads)
```

- **Frontend**: Next.js 14 + TailwindCSS — gestisce UI, autenticazione, upload
- **Backend**: Node.js + Express — gestisce OTP, upload file, yt-dlp, download ZIP
- **Persistenza**: SQLite via `better-sqlite3` (file `./data/db.sqlite`)
- **File**: salvati in `./data/uploads/<user_id>/base.<ext>`
- **Comunicazione frontend→backend**: REST API interne (docker network)
- **Email**: SMTP (stessa configurazione di sempliceAssociazione)

---

## Struttura delle Cartelle del Progetto

```
concorso-canto/
├── docker-compose.yml
├── .env.example
├── .env.production
├── .gitignore
├── frontend/               # Next.js app
│   ├── Dockerfile
│   ├── package.json
│   ├── app/
│   │   ├── page.tsx                  # Login (redirect se già autenticato)
│   │   ├── dashboard/page.tsx        # Utente: vedi/carica base
│   │   ├── admin/page.tsx            # Admin: lista utenti, gestione
│   │   └── api/auth/[...].ts         # Solo proxy/session, auth vera è sul backend
│   ├── components/
│   └── lib/
└── backend/                # Node.js + Express
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── index.ts              # Entry point Express
        ├── db.ts                 # SQLite setup
        ├── routes/
        │   ├── auth.ts           # /api/auth/request-otp, /api/auth/verify-otp
        │   ├── upload.ts         # /api/upload, /api/upload/status
        │   ├── admin.ts          # /api/admin/users, /api/admin/download-all
        │   └── download.ts       # /api/download/:userId
        └── services/
            ├── otp.ts            # Generazione e validazione OTP
            ├── email.ts          # Invio email SMTP
            ├── filecheck.ts      # Verifica magic bytes (file-type)
            └── ytdlp.ts          # Download YouTube → mp4
```

---

## Schema SQLite

```sql
-- Utenti ammessi al concorso
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT UNIQUE NOT NULL,
  nome        TEXT NOT NULL,
  cognome     TEXT NOT NULL,
  canzone     TEXT NOT NULL,      -- titolo della canzone/base
  is_admin    INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- OTP temporanei (TTL 1 minuto)
CREATE TABLE otp_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL,
  expires_at  TEXT NOT NULL,      -- ISO datetime, validità 60 secondi
  used        INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Upload basi
CREATE TABLE uploads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  filename    TEXT NOT NULL,      -- es: "base.mp4"
  original_name TEXT,             -- nome originale del file caricato
  source_type TEXT NOT NULL,      -- 'file' | 'youtube'
  youtube_url TEXT,               -- se source_type = 'youtube'
  uploaded_at TEXT DEFAULT (datetime('now'))
);

-- Sessioni (JWT-like con token firmato, senza DB session store)
-- Usiamo JWT firmato con SECRET, nessuna tabella necessaria
```

---

## Flusso Autenticazione

### Login Utente
1. `POST /api/auth/request-otp` con `{ email }`
2. Backend verifica se email è in tabella `users`
3. **Sempre** risponde `{ message: "Se l'email è registrata, riceverai un OTP" }` (anti-enumeration)
4. Se email esiste: genera OTP 6 cifre, salva in `otp_tokens` con `expires_at = now + 60s`, invia email
5. `POST /api/auth/verify-otp` con `{ email, otp }`
6. Backend verifica OTP valido, non scaduto, non già usato → marca `used=1`
7. Restituisce JWT firmato con `{ userId, email, isAdmin, exp: now+24h }`
8. JWT salvato in httpOnly cookie sul frontend

### Login Admin
- Stessa procedura, ma JWT contiene `isAdmin: true`
- Routes admin protette da middleware che verifica `isAdmin`

---

## Funzionalità per Utente

### Dashboard Utente (`/dashboard`)
- Mostra nome, cognome, canzone assegnata
- Se ha già una base caricata:
  - Mostra data/ora upload
  - Link per scaricarla (verifica in anteprima)
  - Pulsante "Carica una nuova base" (sostituirà quella precedente)
- Upload form:
  - **Opzione A**: Upload file (audio/video, qualsiasi formato)
    - Client-side: filtro per estensioni comuni
    - Server-side: verifica magic bytes con `file-type` npm package
    - Rigetta eseguibili, PDF, archivi, ecc.
  - **Opzione B**: URL YouTube
    - Backend chiama `yt-dlp` per scaricare e convertire in mp4
    - Mostra stato "conversione in corso..." (polling)
- Ogni upload cancella il precedente file fisico e aggiorna la riga in `uploads`

---

## Funzionalità Admin

### Dashboard Admin (`/admin`)

**Sezione 1: Lista Partecipanti**

Tabella con colonne:
| Nome | Cognome | Email | Canzone | Base Caricata | Data Upload | Azioni |
|------|---------|-------|---------|---------------|-------------|--------|

- Badge verde "✓ Caricata" / rosso "✗ Mancante" per ogni utente
- Link download per chi ha già caricato
- Pulsante "Carica base al posto suo" → upload form identico a quello utente

**Sezione 2: Download Massivo**
- Pulsante "Scarica tutte le basi (ZIP)" → `GET /api/admin/download-all`
- Backend genera ZIP al volo con `archiver` (npm) e lo streama

**Sezione 3: Gestione Utenti**
- Form "Aggiungi partecipante" (email, nome, cognome, canzone)
- Pulsante rimozione utente (con conferma)
- Toggle `is_admin` per promuovere/degradare admin

---

## Controllo File (Anti-Eseguibili)

Il backend usa il package npm `file-type` per leggere i magic bytes del file caricato:

```typescript
import { fileTypeFromBuffer } from 'file-type';

const allowed = [
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/webm', 'video/ogg',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac',
  'audio/aac', 'audio/mp4', 'audio/x-m4a',
];

const type = await fileTypeFromBuffer(buffer);
if (!type || !allowed.includes(type.mime)) {
  return res.status(400).json({ error: 'Formato file non supportato' });
}
```

---

## Conversione YouTube

Backend usa `yt-dlp` (installato nel container Docker):

```bash
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
       -o "/data/uploads/<userId>/base.mp4" \
       --merge-output-format mp4 \
       "<youtube_url>"
```

- Timeout: 10 minuti max
- Se il video è protetto da copyright → yt-dlp fallisce → risposta di errore all'utente
- Il frontend fa polling su `GET /api/upload/status` mentre la conversione è in corso

---

## Design UI

- **Tema**: dark mode elegante, palette blu/viola scuro ispirata alla scena musicale/concorso
- **Font**: Google Fonts - Inter
- **Componenti**: TailwindCSS con glassmorphism e animazioni sottili
- **Responsive**: mobile-first (i partecipanti probabilmente usano telefono)
- **Pagine**:
  - `/` — Login con email e step OTP
  - `/dashboard` — Area utente
  - `/admin` — Area admin (tabbata: Partecipanti / Download / Gestione)

---

## Docker Compose

```yaml
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      - BACKEND_URL=http://backend:4000
    depends_on: [backend]

  backend:
    build: ./backend
    ports: ["4000:4000"]   # non esposto all'esterno, solo per dev
    volumes:
      - ./data:/data       # SQLite + uploads
    env_file: .env.production
```

Il nginx dell'host fa proxy su `localhost:3000` (frontend), che a sua volta chiama il backend internamente. La porta 4000 del backend non è esposta pubblicamente.

---

## File .env Necessari

```env
# Email SMTP
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tuacasella@gmail.com
EMAIL_PASS=xxxx-xxxx-xxxx-xxxx
EMAIL_FROM=concorso@example.com

# JWT
JWT_SECRET=cambia-con-stringa-sicura-32-caratteri

# Admin iniziale (creato al primo avvio se non esiste)
ADMIN_EMAIL=admin@example.com
ADMIN_NOME=Roberto
ADMIN_COGNOME=Bruni

# Backend URL (usato dal frontend SSR)
NEXT_PUBLIC_BACKEND_URL=http://backend:4000
BACKEND_URL=http://backend:4000
```

---

## Piano di Sviluppo (Ordine Esecuzione)

1. **Scaffolding**: Creare struttura cartelle e file di configurazione (Docker, env, .gitignore)
2. **Backend**: Setup Express + SQLite + seeding admin iniziale
3. **Backend Auth**: Routes OTP request/verify, generazione JWT, invio email
4. **Backend Upload**: Route upload file con file-type check, salvataggio
5. **Backend YouTube**: Integrazione yt-dlp, polling status
6. **Backend Admin**: Routes lista utenti, upload per conto terzi, download ZIP
7. **Frontend**: Setup Next.js, TailwindCSS, layout base
8. **Frontend Login**: Pagina login con step email → OTP
9. **Frontend Dashboard**: Visualizzazione stato upload, form upload
10. **Frontend Admin**: Tabella utenti, gestione, download massivo
11. **Docker**: Build e test dei Dockerfile
12. **README**: Documentazione deploy

---

## Domande Aperte

> [!IMPORTANT]
> **Porta sul Raspberry**: La nuova app gira sulla stessa macchina di `sempliceAssociazione`. `sempliceAssociazione` usa la porta 3000. La nuova app frontend deve usare una porta diversa (es. 3001) e il backend 4001. L'nginx host dovrà avere un nuovo vhost/location per questo secondo sito. Confermi di gestire tu la configurazione nginx e Let's Encrypt? Hai già un dominio per questa app?

> [!NOTE]
> **Primo admin**: Al primo avvio del backend, se `ADMIN_EMAIL` non è in tabella, verrà inserito automaticamente con `is_admin=1`. Questo è il modo per avere il primo accesso admin senza UI.

> [!NOTE]
> **Dimensione massima upload**: Ho ipotizzato 500MB per i file audio/video. Il raspberry deve avere spazio sufficiente. Posso ridurre o aumentare il limite.

> [!NOTE]
> **Sessione utente**: JWT con scadenza 24h in httpOnly cookie. Non è richiesto logout esplicito, ma il tasto "Esci" invaliderà il cookie lato client.
