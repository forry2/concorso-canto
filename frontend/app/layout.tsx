import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InOut Contest — Basi karaoke',
  description: 'Carica la tua base per il concorso di canto',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
