'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearSession, getStoredUser, type User } from '@/lib/api';
import { useEffect, useState } from 'react';

export function AppHeader({ title }: { title?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [siteTitle, setSiteTitle] = useState('InOut Contest');

  useEffect(() => {
    setUser(getStoredUser());
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { siteTitle?: string } | null) => {
        if (data?.siteTitle) setSiteTitle(data.siteTitle);
      })
      .catch(() => undefined);
  }, []);

  function logout() {
    clearSession();
    router.replace('/');
  }

  return (
    <header className="border-b border-ink/10 bg-cream/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <div>
          <Link href={user?.isAdmin ? '/admin' : '/dashboard'} className="font-display text-lg font-bold leading-tight tracking-tight text-ink sm:text-xl">
            {siteTitle}
          </Link>
          {title ? <p className="text-sm text-ink/60">{title}</p> : null}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden text-ink/70 sm:inline">
                {user.nome} {user.cognome}
              </span>
              {user.isAdmin ? (
                <Link href="/admin" className="btn-ghost text-xs">
                  Admin
                </Link>
              ) : null}
              <button type="button" onClick={logout} className="btn-ghost text-xs">
                Esci
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
