'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ApiConnection } from '@/lib/dashboard-status';
import { connectionLabel } from '@/lib/dashboard-status';
import { getSidebarItems, type SidebarItem } from '@/lib/sidebar-navigation';
import type { AuthUser } from '@/lib/types';

type SidebarProps = {
  role: AuthUser['role'] | undefined;
  apiConnection?: ApiConnection;
  lastRefresh?: Date | null;
};

/** Iconos vectoriales coherentes con la identidad TUNUPA (sin dependencias nuevas). */
function NavigationIcon({ id }: { id: SidebarItem['id'] }) {
  return (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      {id === 'dashboard' && (
        <>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.4" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" />
        </>
      )}
      {id === 'clients' && (
        <>
          <rect x="4" y="8" width="16" height="13" rx="1.5" />
          <path d="M8 8V4.5h8V8M9 12h2m2 0h2m-6 4h2m2 0h2M12 21v-4" />
        </>
      )}
      {id === 'adminMotors' && (
        <>
          <rect x="3" y="7" width="18" height="14" rx="2" />
          <path d="M8 7V4h8v3M3 12h18M12 10v4" />
        </>
      )}
      {id === 'motors' && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4V2m0 20v-2M4 12H2m20 0h-2" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 8.5v7M8.5 12h7" />
        </>
      )}
      {id === 'alarms' && (
        <>
          <path d="M10.3 4.6 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v5m0 3h.01" />
        </>
      )}
      {id === 'devices' && (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M7 10h6M7 14h4m5-4h1m-1 4h1M8 19v2m8-2v2" />
        </>
      )}
    </svg>
  );
}

export function AppSidebar({ role, apiConnection, lastRefresh }: SidebarProps) {
  const pathname = usePathname();
  // Asociamos la apertura a la ruta actual: al navegar, el menú móvil se cierra.
  const [mobileMenu, setMobileMenu] = useState({ path: pathname, open: false });
  const menuOpen = mobileMenu.path === pathname && mobileMenu.open;

  return (
    <aside className="sidebar tunupa-sidebar" aria-label="Menú lateral TUNUPA">
      <div className="brand tunupa-sidebar-brand">
        <Link href="/" className="tunupa-brand-link" aria-label="TUNUPA — Ir al panel general">
          <Image src="/brand/tunupa/logo-horizontal-light.svg" alt="TUNUPA — Gestor de motores"
            width={895} height={228} className="tunupa-logo-horizontal" priority />
          <Image src="/brand/tunupa/symbol-orange.svg" alt=""
            width={46} height={40} className="tunupa-logo-compact" aria-hidden="true" />
        </Link>
        <button type="button" className="tunupa-menu-toggle"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen} aria-controls="tunupa-primary-navigation"
          onClick={() => setMobileMenu({ path: pathname, open: !menuOpen })}>
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M5 5l14 14M19 5 5 19" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <nav id="tunupa-primary-navigation" aria-label="Navegación principal"
        className={`tunupa-sidebar-nav${menuOpen ? ' is-open' : ''}`}>
        {getSidebarItems(role).map((item) => {
          const active = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          return (
            <Link key={item.id}
              className={`nav-item tunupa-sidebar-link${active ? ' active' : ''}`}
              href={item.href} aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={() => setMobileMenu({ path: pathname, open: false })}>
              <NavigationIcon id={item.id} />
              <span className="nav-item-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="tunupa-sidebar-bottom">
        {apiConnection && (
          <div className="sidebar-footer tunupa-sidebar-footer" title={connectionLabel(apiConnection)}>
            <span className={`live-dot ${apiConnection}`} aria-hidden="true" />
            <span role="status">{connectionLabel(apiConnection)}</span>
            <small>{lastRefresh
              ? `Última consulta correcta ${lastRefresh.toLocaleTimeString('es-CL')}`
              : 'Sin consulta correcta todavía'}</small>
          </div>
        )}
        <div className="tunupa-developed-by">Un desarrollo de <strong>GroundTEK</strong> Power Systems</div>
      </div>
    </aside>
  );
}
