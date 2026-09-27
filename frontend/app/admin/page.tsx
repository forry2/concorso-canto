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
  type AdminUser,
  type User,
} from '@/lib/api';

type Tab = 'partecipanti' | 'download' | 'gestione';
type SortKey = 'nome' | 'cognome' | 'email' | 'canzone' | 'presentazione' | 'base' | 'data' | 'azioni';
type SortDir = 'asc' | 'desc';

function presentazionePreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '—';
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

function uploadedAtMs(u: AdminUser): number | null {
  if (!u.upload?.uploadedAt) return null;
  const ms = Date.parse(u.upload.uploadedAt.replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) ? null : ms;
}

function compareParticipants(a: AdminUser, b: AdminUser, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  let result = 0;

  if (key === 'base') {
    const rank = (u: AdminUser) => (u.ytdlpStatus?.status === 'processing' ? 1 : u.upload?.fileExists ? 2 : 0);
    result = rank(a) - rank(b);
  } else if (key === 'azioni') {
    const rank = (u: AdminUser) => (u.upload?.fileExists ? 1 : 0);
    result = rank(a) - rank(b);
  } else if (key === 'data') {
    const ad = uploadedAtMs(a);
    const bd = uploadedAtMs(b);
    if (ad === null && bd === null) result = 0;
    else if (ad === null) return 1;
    else if (bd === null) return -1;
    else result = ad - bd;
  } else {
    const text = (u: AdminUser) => {
      if (key === 'nome') return u.nome;
      if (key === 'cognome') return u.cognome;
      if (key === 'email') return u.email;
      if (key === 'presentazione') return u.presentazione || '';
      return u.canzone;
    };
    result = text(a).localeCompare(text(b), 'it', { sensitivity: 'base' });
  }

  if (result === 0) return a.cognome.localeCompare(b.cognome, 'it', { sensitivity: 'base' }) || a.id - b.id;
  return result * sign;
}

const emptyForm = { email: '', nome: '', cognome: '', canzone: '', presentazione: '', isAdmin: false };

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('partecipanti');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [hideAdmins, setHideAdmins] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('cognome');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadUsers = useCallback(async () => {
    const data = await api<{ users: AdminUser[] }>('/api/admin/users');
    setUsers(data.users);
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
        if (!me.isAdmin) {
          router.replace('/dashboard');
          return;
        }
        await loadUsers();
        if (!cancelled) setLoading(false);
      } catch {
        clearSession();
        if (!cancelled) router.replace('/');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, loadUsers]);

  async function downloadOne(u: AdminUser) {
    setError(null);
    try {
      await downloadWithAuth(
        `/api/download/${u.id}`,
        u.upload?.originalName || u.upload?.filename || `${u.cognome}_${u.nome}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download fallito');
    }
  }

  async function downloadAll() {
    setError(null);
    try {
      await downloadWithAuth(
        '/api/admin/download-all',
        `basi-concorso-${new Date().toISOString().slice(0, 10)}.zip`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download ZIP fallito');
    }
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editId) {
        await api(`/api/admin/users/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await api('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setForm(emptyForm);
      setEditId(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio fallito');
    }
  }

  async function deleteUser(id: number) {
    if (!confirm('Eliminare questo utente e la sua base?')) return;
    setError(null);
    try {
      await api(`/api/admin/users/${id}`, { method: 'DELETE' });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eliminazione fallita');
    }
  }

  async function resetUpload(u: AdminUser) {
    if (!confirm(`Cancellare la base caricata da ${u.nome} ${u.cognome}? Il file verrà rimosso dal disco.`)) return;
    setError(null);
    try {
      await api(`/api/admin/users/${u.id}/upload`, { method: 'DELETE' });
      if (uploadFor === u.id) setUploadFor(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset della base fallito');
    }
  }

  async function toggleAdmin(u: AdminUser) {
    const next = !u.isAdmin;
    const label = next
      ? `Rendere ${u.nome} ${u.cognome} amministratore?`
      : `Togliere i privilegi di amministratore a ${u.nome} ${u.cognome}?`;
    if (!confirm(label)) return;
    setError(null);
    try {
      await api(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          email: u.email,
          nome: u.nome,
          cognome: u.cognome,
          canzone: u.canzone,
          presentazione: u.presentazione || '',
          isAdmin: next,
        }),
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aggiornamento ruolo fallito');
    }
  }

  function startEdit(u: AdminUser) {
    setEditId(u.id);
    setForm({
      email: u.email,
      nome: u.nome,
      cognome: u.cognome,
      canzone: u.canzone,
      presentazione: u.presentazione || '',
      isAdmin: u.isAdmin,
    });
    setTab('gestione');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink/60">Caricamento…</div>
    );
  }

  const visibleUsers = (hideAdmins ? users.filter((u) => !u.isAdmin) : users)
    .slice()
    .sort((a, b) => compareParticipants(a, b, sortKey, sortDir));
  const uploaded = visibleUsers.filter((u) => u.upload?.fileExists).length;
  const missing = visibleUsers.length - uploaded;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  return (
    <div className="min-h-screen">
      <AppHeader title="Area admin" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['partecipanti', 'Partecipanti'],
              ['download', 'Download'],
              ['gestione', 'Gestione utenti'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        {tab === 'partecipanti' ? (
          <section className="panel overflow-x-auto">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold">Partecipanti</h1>
                <p className="text-sm text-ink/60">
                  {uploaded} basi caricate · {missing} mancanti
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={hideAdmins ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => setHideAdmins((v) => !v)}
                >
                  {hideAdmins ? 'Mostra admin' : 'Nascondi admin'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => loadUsers()}>
                  Aggiorna
                </button>
              </div>
            </div>

            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-ink/60">
                  {(
                    [
                      ['nome', 'Nome'],
                      ['cognome', 'Cognome'],
                      ['email', 'Email'],
                      ['canzone', 'Canzone'],
                      ['presentazione', 'Presentazione'],
                      ['base', 'Base'],
                      ['data', 'Data'],
                      ['azioni', 'Azioni'],
                    ] as const
                  ).map(([key, label]) => (
                    <th key={key} className="py-2 pr-3 font-semibold">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-ink"
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        <span aria-hidden="true">{sortMark(key)}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => (
                  <tr key={u.id} className="border-b border-ink/5 align-top">
                    <td className="py-3 pr-3">{u.nome}</td>
                    <td className="py-3 pr-3">{u.cognome}</td>
                    <td className="py-3 pr-3 text-ink/70">{u.email}</td>
                    <td className="py-3 pr-3">{u.canzone}</td>
                    <td className="max-w-[16rem] py-3 pr-3 text-ink/80" title={u.presentazione || undefined}>
                      {presentazionePreview(u.presentazione || '')}
                    </td>
                    <td className="py-3 pr-3">
                      {u.upload?.fileExists ? (
                        <span className="rounded bg-emerald-700/90 px-2 py-0.5 text-xs font-semibold text-white">
                          Caricata
                        </span>
                      ) : (
                        <span className="rounded bg-red-800/80 px-2 py-0.5 text-xs font-semibold text-white">
                          Mancante
                        </span>
                      )}
                      {u.ytdlpStatus?.status === 'processing' ? (
                        <span className="ml-1 text-xs text-stage">yt-dlp…</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 text-ink/60">
                      {u.upload?.uploadedAt
                        ? new Date(u.upload.uploadedAt.replace(' ', 'T') + 'Z').toLocaleString('it-IT')
                        : '—'}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col gap-1">
                        {u.upload?.fileExists ? (
                          <button type="button" className="btn-ghost text-xs" onClick={() => downloadOne(u)}>
                            Scarica
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => setUploadFor(uploadFor === u.id ? null : u.id)}
                        >
                          {uploadFor === u.id ? 'Chiudi upload' : 'Carica per lui'}
                        </button>
                        <button type="button" className="btn-ghost text-xs" onClick={() => startEdit(u)}>
                          Modifica
                        </button>
                        {u.upload || u.ytdlpStatus?.status === 'processing' ? (
                          <button type="button" className="btn-danger text-xs" onClick={() => resetUpload(u)}>
                            Resetta base
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {uploadFor && visibleUsers.some((u) => u.id === uploadFor) ? (
              <div className="mt-6 border-t border-ink/10 pt-6">
                <h2 className="mb-3 font-display text-lg font-semibold">
                  Carica base per{' '}
                  {users.find((x) => x.id === uploadFor)?.nome}{' '}
                  {users.find((x) => x.id === uploadFor)?.cognome}
                </h2>
                <UploadForm
                  endpoint={`/api/admin/upload/${uploadFor}`}
                  statusEndpoint={`/api/admin/ytdlp-status/${uploadFor}`}
                  onDone={async () => {
                    setUploadFor(null);
                    await loadUsers();
                  }}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'download' ? (
          <section className="panel space-y-4">
            <h1 className="font-display text-2xl font-bold">Download massivo</h1>
            <p className="text-sm text-ink/70">
              Scarica uno ZIP con tutte le basi già caricate, nominate come cognome_nome_canzone.
            </p>
            <button type="button" className="btn-primary" onClick={downloadAll}>
              Scarica tutte le basi (ZIP)
            </button>
          </section>
        ) : null}

        {tab === 'gestione' ? (
          <section className="panel space-y-6">
            <h1 className="font-display text-2xl font-bold">
              {editId ? 'Modifica partecipante' : 'Aggiungi partecipante'}
            </h1>
            <form onSubmit={saveUser} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="f-email">
                  Email
                </label>
                <input
                  id="f-email"
                  type="email"
                  required
                  className="field"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="f-canzone">
                  Canzone
                </label>
                <input
                  id="f-canzone"
                  className="field"
                  placeholder="Facoltativo"
                  value={form.canzone}
                  onChange={(e) => setForm({ ...form, canzone: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="f-nome">
                  Nome
                </label>
                <input
                  id="f-nome"
                  className="field"
                  placeholder="Facoltativo"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="f-cognome">
                  Cognome
                </label>
                <input
                  id="f-cognome"
                  className="field"
                  placeholder="Facoltativo"
                  value={form.cognome}
                  onChange={(e) => setForm({ ...form, cognome: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="f-presentazione">
                  Presentazione della canzone
                </label>
                <textarea
                  id="f-presentazione"
                  className="field min-h-[8rem]"
                  maxLength={1000}
                  placeholder="Facoltativo, massimo 1000 caratteri"
                  value={form.presentazione}
                  onChange={(e) => setForm({ ...form, presentazione: e.target.value })}
                />
                <p className="mt-1 text-xs text-ink/50">{form.presentazione.length} / 1000</p>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isAdmin}
                  onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
                />
                Privilegi admin
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" className="btn-primary">
                  {editId ? 'Salva modifiche' : 'Aggiungi'}
                </button>
                {editId ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setEditId(null);
                      setForm(emptyForm);
                    }}
                  >
                    Annulla
                  </button>
                ) : null}
              </div>
            </form>

            <div className="border-t border-ink/10 pt-6">
              <h2 className="mb-3 font-display text-lg font-semibold">Utenti registrati</h2>
              <ul className="space-y-2">
                {users.map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist/50 px-3 py-2 text-sm"
                  >
                    <span>
                      {u.cognome} {u.nome} · {u.email}
                      {u.isAdmin ? (
                        <span className="ml-2 rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-cream">
                          admin
                        </span>
                      ) : (
                        <span className="ml-2 text-ink/50">cantante</span>
                      )}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-ghost text-xs" onClick={() => toggleAdmin(u)}>
                        {u.isAdmin ? 'Togli admin' : 'Rendi admin'}
                      </button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => startEdit(u)}>
                        Modifica
                      </button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deleteUser(u.id)}>
                        Elimina
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
