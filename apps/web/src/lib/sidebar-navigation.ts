import type { AuthUser } from './types';

export interface SidebarItem {
  id: 'dashboard';
  href: '#dashboard';
  label: string;
}

// Solo publicar accesos con funcionalidad real. Los módulos siguientes
// ampliarán este registro cuando tengan ruta y autorización implementadas.
export function getSidebarItems(role: AuthUser['role'] | undefined): SidebarItem[] {
  return [{
    id: 'dashboard',
    href: '#dashboard',
    label: role === 'ADMIN' ? 'Panel general — Admin' : 'Panel general',
  }];
}
