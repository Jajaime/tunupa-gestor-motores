import type { MetadataRoute } from 'next';

// Metadatos de instalación e iconografía. No activa soporte sin conexión (offline).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TUNUPA | Gestor de motores',
    short_name: 'TUNUPA',
    description: 'Monitoreo de motores eléctricos y gestión de activos.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#1B1D22',
    theme_color: '#2A1B12',
    icons: [
      { src: '/brand/tunupa/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/tunupa/app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
