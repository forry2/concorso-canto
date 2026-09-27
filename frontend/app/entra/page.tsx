'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setSession, type User } from '@/lib/api';

export default function MagicLinkPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t') || '';
    if (!token) {
      setError('Link non valido. Chiedi un nuovo codice dalla pagina di accesso.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ token: string; user: User }>('/api/auth/magic', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        setSession(res.token, res.user);
        router.replace(res.user.isAdmin ? '/admin' : '/dashboard');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Link non valido o scaduto');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-md text-center">
        {error ? (
          <>
            <p className="text-ink">{error}</p>
            <a href="/" className="btn-primary mt-4">
              Torna al login
            </a>
          </>
        ) : (
          <p className="text-ink/70">Accesso in corso…</p>
        )}
      </div>
    </main>
  );
}
