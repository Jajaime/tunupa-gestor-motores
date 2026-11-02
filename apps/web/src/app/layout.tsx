import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/components/auth/auth-provider';
import './globals.css';
// Aplicar las variables y ajustes TUNUPA después del CSS histórico.
import '../styles/tunupa-brand-tokens.css';
import '../styles/tunupa-theme.css';

export const metadata: Metadata = {
  title: 'Tunupa | Monitoreo de motores',
  description: 'Dashboard de telemetría y condición de motores eléctricos.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
