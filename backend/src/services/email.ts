import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendOtpEmail(email: string, otp: string, magicToken: string): Promise<void> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const link = site && magicToken ? `${site}/entra?t=${encodeURIComponent(magicToken)}` : '';
  const linkHtml = link
    ? `<p style="text-align:center;margin:20px 0;">
          <a href="${link}" style="display:inline-block;background:#c45c26;color:#fff;text-decoration:none;
             font-weight:700;padding:12px 20px;border-radius:8px;">Entra nel sito</a>
        </p>`
    : '';
  const intro = link
    ? `Per entrare nel sito, inserisci questo codice oppure <a href="${link}" style="color:#fbbf24;font-weight:700;">clicca qui</a>.`
    : `Hai richiesto l'accesso al portale. Inserisci il codice qui sotto.`;
  const linkText = link
    ? `\n\nPer entrare nel sito, inserisci questo OTP oppure apri questo link:\n${link}\n`
    : '';

  await transporter.sendMail({
    from: `"🎵 Concorso di Canto" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: `Il tuo codice di accesso: ${otp}`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a1a;color:#e5e7eb;padding:32px;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:48px;">🎵</div>
          <h1 style="color:#a78bfa;margin:8px 0;font-size:24px;font-weight:700;">Concorso di Canto</h1>
        </div>
        <p style="color:#9ca3af;font-size:15px;margin-bottom:16px;">
          ${intro}
        </p>
        <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border:1px solid #4c1d95;
                    border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
          <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#a78bfa;
                       font-family:'Courier New',monospace;">${otp}</span>
        </div>
        ${linkHtml}
        <p style="color:#6b7280;font-size:13px;text-align:center;margin-top:16px;">
          ⏱ Codice e link sono validi per <strong style="color:#fbbf24;">3 minuti</strong> e si possono usare una sola volta.<br>
          Se non hai richiesto questo codice, ignora questa email.
        </p>
      </div>
    `,
    text: `Il tuo codice OTP per il Concorso di Canto è: ${otp}\nValido per 3 minuti.${linkText}`,
  });
}
