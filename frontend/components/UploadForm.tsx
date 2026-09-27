'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Props = {
  /** Endpoint upload: /api/upload oppure /api/admin/upload/:id */
  endpoint: string;
  onDone: () => void;
  /** Polling status URL opzionale (admin: /api/admin/ytdlp-status/:id) */
  statusEndpoint?: string;
};

export function UploadForm({ endpoint, onDone, statusEndpoint = '/api/upload/status' }: Props) {
  const [mode, setMode] = useState<'file' | 'youtube'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  async function pollUntilDone() {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await api<{ status: string; message?: string; error?: string }>(statusEndpoint);
      if (st.status === 'done' || st.status === 'idle') {
        setProgress(null);
        setSuccess('Caricamento completato.');
        onDone();
        return;
      }
      if (st.status === 'error' || st.status === 'failed') {
        throw new Error(st.error || st.message || 'Conversione YouTube fallita');
      }
      setProgress('Caricamento in corso…');
    }
    throw new Error('Timeout conversione YouTube');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    setProgress('Caricamento in corso…');

    try {
      if (mode === 'youtube') {
        if (!youtubeUrl.trim()) throw new Error('Inserisci un URL YouTube');
        const fd = new FormData();
        fd.append('youtubeUrl', youtubeUrl.trim());
        const res = await api<{ status?: string; message?: string }>(endpoint, {
          method: 'POST',
          body: fd,
        });
        if (res.status === 'processing') {
          setProgress('Caricamento in corso…');
          await pollUntilDone();
        } else {
          setProgress(null);
          setSuccess('Caricamento completato.');
          onDone();
        }
      } else {
        if (!file) throw new Error('Seleziona un file audio o video');
        const fd = new FormData();
        fd.append('file', file);
        await api(endpoint, { method: 'POST', body: fd });
        setProgress(null);
        setSuccess('Caricamento completato.');
        onDone();
      }
      setFile(null);
      setYoutubeUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore upload');
      setProgress(null);
      setSuccess(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          className={mode === 'file' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setMode('file')}
        >
          File audio/video
        </button>
        <button
          type="button"
          className={mode === 'youtube' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setMode('youtube')}
        >
          Link YouTube
        </button>
      </div>

      {mode === 'file' ? (
        <div>
          <label className="label" htmlFor="base-file">
            File (mp3, mp4, wav, …)
          </label>
          <input
            id="base-file"
            type="file"
            accept="audio/*,video/*,.mp3,.mp4,.wav,.flac,.ogg,.webm,.mkv,.avi,.m4a"
            className="field"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="yt-url">
            URL YouTube
          </label>
          <input
            id="yt-url"
            type="url"
            className="field"
            placeholder="https://www.youtube.com/watch?v=…"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink/50">
            Il video verrà convertito in mp4. Se protetto da copyright, la conversione può fallire.
          </p>
        </div>
      )}

      <p className="text-sm font-semibold text-ink">
        Non chiudere la pagina finché il caricamento non è completato.
      </p>
      {progress ? <p className="text-sm font-semibold text-stage">{progress}</p> : null}
      {success ? <p className="text-sm font-semibold text-emerald-800">{success}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Caricamento in corso…' : 'Carica base'}
      </button>
    </form>
  );
}
