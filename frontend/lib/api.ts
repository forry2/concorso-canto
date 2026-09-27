export type User = {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  canzone: string;
  presentazione: string;
  isAdmin: boolean;
};

export type UploadInfo = {
  filename: string;
  original_name: string | null;
  source_type: string;
  youtube_url: string | null;
  uploaded_at: string;
  fileExists: boolean;
};

export type AdminUser = {
  id: number;
  email: string;
  nome: string;
  cognome: string;
  canzone: string;
  presentazione: string;
  isAdmin: boolean;
  createdAt: string;
  upload: {
    filename: string;
    originalName: string | null;
    sourceType: string;
    youtubeUrl: string | null;
    uploadedAt: string;
    fileExists: boolean;
  } | null;
  ytdlpStatus: { status: string; message?: string } | null;
};

const TOKEN_KEY = 'concorso_token';
const USER_KEY = 'concorso_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.error || data.message || `Errore ${res.status}`;
  } catch {
    return `Errore ${res.status}`;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok) throw new Error(await parseError(res));

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return undefined as T;
}

export function downloadUrl(userId: number): string {
  return `/api/download/${userId}`;
}

export async function downloadWithAuth(url: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    if (res.status === 401) clearSession();
    throw new Error(await parseError(res));
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
