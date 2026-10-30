'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ApiConnection } from '@/lib/dashboard-status';
import { connectionLabel } from '@/lib/dashboard-status';
import { getSidebarItems } from '@/lib/sidebar-navigation';
import type { AuthUser } from '@/lib/types';

type SidebarProps = {
  role: AuthUser['role'] | undefined;
  apiConnection?: ApiConnection;
  lastRefresh?: Date | null;
};

export function AppSidebar({ role, apiConnection, lastRefresh }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">T</span>
        <div className="brand-identity">
          <span className="brand-logo-frame">
            <Image src="/brand/groundtek-logo.png" alt="GroundTEK" width={298} height={40}
              className="brand-logo" priority />
          </span>
          <small>Gestor de motores</small>
        </div>
      </div>
      <nav aria-label="Navegación principal">
        {getSidebarItems(role).map((item) => {
          const active = pathname === item.href ||
            (item.id === 'motors' && pathname.startsWith('/motors/'));
          return (
            <Link key={item.id} className={`nav-item${active ? ' active' : ''}`} href={item.href}
              aria-current={active ? 'page' : undefined} title={item.label}>
              <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                {item.id === 'clients' ? (
                  <>
                    <rect x="3" y="8" width="18" height="13" rx="2" />
                    <path d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3M3 14h18" />
                  </>
                ) : item.id === 'devices' ? (
                  <>
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <path d="M8 9h8M8 13h8M9 19v2M15 19v2" />
                  </>
                ) : item.id === 'alarms' ? (
                  <>
                    <path d="M12 3c-4 0-6 3-6 7v4l-2 3h16l-2-3v-4c0-4-2-7-6-7z" />
                    <path d="M10 21h4" />
                  </>
                ) : item.id === 'motors' ? (
                  <>
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 4v3M20 12h-3M12 20v-3M4 12h3" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="3" width="7" height="7" rx="1.3" />
                    <rect x="14" y="3" width="7" height="7" rx="1.3" />
                    <rect x="3" y="14" width="7" height="7" rx="1.3" />
                    <rect x="14" y="14" width="7" height="7" rx="1.3" />
                  </>
                )}
              </svg>
              <span className="nav-item-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {apiConnection && (
        <div className="sidebar-footer">
          <span className={`live-dot ${apiConnection}`} aria-hidden="true" />
          <span role="status">{connectionLabel(apiConnection)}</span>
          <small>{lastRefresh
            ? `Última consulta correcta ${lastRefresh.toLocaleTimeString('es-CL')}`
            : 'Sin consulta correcta todavía'}</small>
        </div>
      )}
    </aside>
  );
}
