import { Router, Request, Response } from 'express';
import db from '../db';
import { generateOtp, saveOtp, validateOtp, consumeMagicToken } from '../services/otp';
import { sendOtpEmail } from '../services/email';
import { signToken } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Messaggio generico anti-email-enumeration
const OTP_RESPONSE_MESSAGE =
  "Se l'email è registrata, riceverai a breve un codice OTP e un link per entrare, validi per 3 minuti.";

/**
 * POST /api/auth/request-otp
 * Richiede un OTP via email. Risponde sempre allo stesso modo (anti-enumeration).
 */
router.post('/request-otp', async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email non valida' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Cerca utente nel DB (non rivela se esiste o meno)
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(normalizedEmail) as
    | { id: number; email: string }
    | undefined;

  if (user) {
    try {
      const otp = generateOtp();
      const magicToken = saveOtp(normalizedEmail, otp);
      await sendOtpEmail(user.email, otp, magicToken);
      console.log(`[Auth] OTP inviato a ${normalizedEmail}`);
    } catch (err) {
      console.error('[Auth] Errore invio OTP:', err);
      // Non rivelare l'errore all'utente (anti-enumeration)
    }
  } else {
    console.log(`[Auth] Tentativo login per email non registrata: ${normalizedEmail}`);
  }

  // Risposta identica indipendentemente dal risultato
  res.json({ message: OTP_RESPONSE_MESSAGE });
});

/**
 * POST /api/auth/verify-otp
 * Verifica l'OTP e restituisce un JWT se valido.
 */
router.post('/verify-otp', (req: Request, res: Response) => {
  const { email, otp } = req.body;

  if (!email || !otp || typeof email !== 'string' || typeof otp !== 'string') {
    res.status(400).json({ error: 'Email e OTP sono obbligatori' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = db.prepare(
    'SELECT id, email, nome, cognome, canzone, presentazione, is_admin FROM users WHERE email = ?'
  ).get(normalizedEmail) as
    | { id: number; email: string; nome: string; cognome: string; canzone: string; presentazione: string; is_admin: number }
    | undefined;

  if (!user) {
    // Messaggio identico al fallimento OTP (anti-enumeration)
    res.status(401).json({ error: 'Credenziali non valide' });
    return;
  }

  const valid = validateOtp(normalizedEmail, otp.trim());
  if (!valid) {
    res.status(401).json({ error: 'Credenziali non valide' });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    isAdmin: user.is_admin === 1,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      cognome: user.cognome,
      canzone: user.canzone,
      presentazione: user.presentazione || '',
      isAdmin: user.is_admin === 1,
    },
  });
});

/**
 * POST /api/auth/magic
 * Consuma il link monouso dell'email e restituisce un JWT.
 */
router.post('/magic', (req: Request, res: Response) => {
  const magicToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!magicToken) {
    res.status(400).json({ error: 'Link non valido' });
    return;
  }

  const email = consumeMagicToken(magicToken);
  if (!email) {
    res.status(401).json({ error: 'Link non valido o scaduto' });
    return;
  }

  const user = db.prepare(
    'SELECT id, email, nome, cognome, canzone, presentazione, is_admin FROM users WHERE email = ?'
  ).get(email) as
    | { id: number; email: string; nome: string; cognome: string; canzone: string; presentazione: string; is_admin: number }
    | undefined;

  if (!user) {
    res.status(401).json({ error: 'Link non valido o scaduto' });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    isAdmin: user.is_admin === 1,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      cognome: user.cognome,
      canzone: user.canzone,
      presentazione: user.presentazione || '',
      isAdmin: user.is_admin === 1,
    },
  });
});

/**
 * GET /api/auth/me
 * Restituisce i dati dell'utente autenticato.
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = db.prepare(
    'SELECT id, email, nome, cognome, canzone, presentazione, is_admin FROM users WHERE id = ?'
  ).get(req.user!.userId) as
    | { id: number; email: string; nome: string; cognome: string; canzone: string; presentazione: string; is_admin: number }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'Utente non trovato' });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    nome: user.nome,
    cognome: user.cognome,
    canzone: user.canzone,
    presentazione: user.presentazione || '',
    isAdmin: user.is_admin === 1,
  });
});

export default router;
