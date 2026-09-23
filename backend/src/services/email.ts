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

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
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
          Hai richiesto l'accesso al portale. Inserisci il codice qui sotto:
        </p>
        <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border:1px solid #4c1d95;
                    border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
          <span style="font-size:44px;font-weight:800;letter-spacing:10px;color:#a78bfa;
                       font-family:'Courier New',monospace;">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:13px;text-align:center;margin-top:16px;">
          ⏱ Questo codice è valido per <strong style="color:#fbbf24;">1 minuto</strong>.<br>
          Se non hai richiesto questo codice, ignora questa email.
        </p>
      </div>
    `,
    text: `Il tuo codice OTP per il Concorso di Canto è: ${otp}\n\nValido per 1 minuto.`,
  });
}
