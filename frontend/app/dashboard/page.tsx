'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { UploadForm } from '@/components/UploadForm';
import {
  api,
  downloadWithAuth,
  getToken,
  setSession,
  clearSession,
  type UploadInfo,
  type User,
} from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [canzone, setCanzone] = useState('');
  const [presentazione, setPresentazione] = useState('');
  const [upload, setUpload] = useState<UploadInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api<{ upload: UploadInfo | null }>('/api/upload/my');
    setUpload(data.upload);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const me = await api<User>('/api/auth/me');
        if (cancelled) return;
        const current = getToken();
        if (!current) return;
        setSession(current, me);
        if (me.isAdmin) {
          router.replace('/admin');
          return;
        }
        setUser(me);
        setNome(me.nome || '');
        setCognome(me.cognome || '');
        setCanzone(me.canzone || '');
        setPresentazione(me.presentazione || '');
        await refresh();
        if (!cancelled) setLoading(false);
      } catch {
        clearSession();
        if (!cancelled) router.replace('/');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, refresh]);

  const profileReady = Boolean(user && user.nome.trim() && user.cognome.trim() && user.canzone.trim());

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    if (!nome.trim() || !cognome.trim() || !canzone.trim()) {
      setError('Nome, cognome e titolo della canzone sono obbligatori');
      return;
    }
    if (presentazione.trim().length > 1000) {
      setError('La presentazione può avere al massimo 1000 caratteri');
      return;
    }
    try {
      const res = await api<{ nome: string; cognome: string; canzone: string; presentazione: string }>(
        '/api/upload/profilo',
        {
          method: 'PUT',
          body: JSON.stringify({
            nome: nome.trim(),
            cognome: cognome.trim(),
            canzone: canzone.trim(),
            presentazione: presentazione.trim(),
          }),
        }
      );
      const next = { ...user!, ...res };
      setUser(next);
      setNome(res.nome);
      setCognome(res.cognome);
      setCanzone(res.canzone);
      setPresentazione(res.presentazione);
      setSession(getToken()!, next);
      setSaved('Dati salvati.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio fallito');
    }
  }

  async function handleDownload() {
    if (!user) return;
    setError(null);
    try {
      await downloadWithAuth(
        `/api/download/${user.id}`,
        upload?.original_name || upload?.filename || 'base'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download fallito');
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink/60">Caricamento…</div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader title="La tua canzone" />
      <main className="mx-auto max-w-xl px-4 py-8">
        <section className="panel space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold">Inserisci la canzone</h1>
            <p className="mt-2 text-sm text-ink/70">
              Inserisci nome, cognome e titolo, poi carica la base. Puoi aggiungere una presentazione della
              canzone, anche dopo averla già caricata. Un nuovo file sostituisce il precedente.
            </p>
          </div>

          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label className="label" htmlFor="nome">
                Nome
              </label>
              <input
                id="nome"
                className="field"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="cognome">
                Cognome
              </label>
              <input
                id="cognome"
                className="field"
                required
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="canzone">
                Titolo della canzone
              </label>
              <input
                id="canzone"
                className="field"
                required
                value={canzone}
                onChange={(e) => setCanzone(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="presentazione">
                Presentazione della canzone <span className="font-normal text-ink/50">(facoltativa)</span>
              </label>
              <textarea
                id="presentazione"
                className="field min-h-[8rem]"
                maxLength={1000}
                value={presentazione}
                onChange={(e) => setPresentazione(e.target.value)}
                placeholder="Un testo libero per presentarti e presentare la canzone"
              />
              <p className="mt-1 text-xs text-ink/50">{presentazione.length} / 1000</p>
            </div>
            <button type="submit" className="btn-secondary">
              Salva dati
            </button>
          </form>

          {profileReady ? (
            <UploadForm
              endpoint="/api/upload"
              onDone={async () => {
                await refresh();
              }}
            />
          ) : (
            <p className="text-sm text-ink/70">
              Salva nome, cognome e titolo della canzone prima di caricare la base.
            </p>
          )}

          {upload?.fileExists ? (
            <p className="text-sm text-ink/70">
              Base già caricata
              {upload.uploaded_at
                ? ` il ${new Date(upload.uploaded_at.replace(' ', 'T') + 'Z').toLocaleString('it-IT')}`
                : ''}
              .{' '}
              <button type="button" className="underline" onClick={handleDownload}>
                Scaricala
              </button>
            </p>
          ) : null}

          {saved ? <p className="text-sm text-emerald-800">{saved}</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </section>
      </main>
    </div>
  );
}
