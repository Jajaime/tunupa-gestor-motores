import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/components/auth/auth-provider';
import './globals.css';
// Aplicar las variables y ajustes TUNUPA después del CSS histórico.
import '../styles/tunupa-brand-tokens.css';
import '../styles/tunupa-theme.css';
import '../styles/tunupa-sidebar.css';
import '../styles/tunupa-login.css';
import '../styles/tunupa-modules.css';
import '../styles/tunupa-dashboard.css';
import '../styles/tunupa-polish.css';

export const metadata: Metadata = {
  title: 'TUNUPA | Gestor de motores',
  applicationName: 'TUNUPA',
  description: 'Monitoreo de motores eléctricos y gestión de activos.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
