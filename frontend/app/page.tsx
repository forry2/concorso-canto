'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setSession, getToken, getStoredUser, clearSession, type User } from '@/lib/api';

function renderSiteTitle(title: string) {
  const match = title.match(/^(.*\S)\s+(\d{1,2}\s+\S+\s+\d{4})\s*$/);
  if (!match) return title;
  return (
    <>
      {match[1]}{' '}
      <span className="whitespace-nowrap">{match[2]}</span>
    </>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [siteTitle, setSiteTitle] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { siteTitle?: string } | null) => {
        setSiteTitle(data?.siteTitle || 'InOut Contest');
      })
      .catch(() => setSiteTitle('InOut Contest'));
  }, []);

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    if (!token || !user) return;

    let cancelled = false;
    (async () => {
      try {
        const me = await api<User>('/api/auth/me');
        if (cancelled) return;
        setSession(getToken() || token, me);
        router.replace(me.isAdmin ? '/admin' : '/dashboard');
      } catch {
        clearSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ message: string }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(res.message);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string; user: User }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });
      setSession(res.token, res.user);
      router.replace(res.user.isAdmin ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(26,21,32,0.55) 0%, rgba(26,21,32,0.15) 45%, transparent 70%), url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27 viewBox=%270 0 160 160%27%3E%3Cpath fill=%27none%27 stroke=%27%231a1520%27 stroke-opacity=%270.06%27 d=%27M0 80c40-40 80-40 160 0M0 40c40-40 80-40 160 0M0 120c40-40 80-40 160 0%27/%3E%3C/svg%3E")',
          backgroundSize: 'cover, 160px 160px',
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16">
        <h1 className="min-h-[1.1em] font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
          {renderSiteTitle(siteTitle)}
        </h1>
        <p className="mt-4 max-w-md text-lg text-ink/70">
          Accedi con la tua email per caricare la base karaoke del concorso.
        </p>

        <div className="panel mt-10">
          {step === 'email' ? (
            <form onSubmit={requestOtp} className="space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tua@email.it"
                />
              </div>
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? 'Invio…' : 'Ricevi codice OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              {message ? <p className="text-sm text-ink/70">{message}</p> : null}
              <div>
                <label className="label" htmlFor="otp">
                  Codice OTP (valido 3 minuti)
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className="field tracking-[0.3em] text-center text-2xl font-semibold"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                />
              </div>
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? 'Verifica…' : 'Accedi'}
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => {
                  setStep('email');
                  setOtp('');
                  setError(null);
                }}
              >
                Cambia email
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
