import type { AuthUser } from './types';

export interface SidebarItem {
  id: 'dashboard' | 'clients';
  href: '/' | '/admin/clients';
  label: string;
}

// Publicar solo rutas implementadas; restringir la administración por rol.
export function getSidebarItems(role: AuthUser['role'] | undefined): SidebarItem[] {
  const items: SidebarItem[] = [{
    id: 'dashboard',
    href: '/',
    label: role === 'ADMIN' ? 'Panel general — Admin' : 'Panel general',
  }];
  if (role === 'ADMIN') {
    items.push({ id: 'clients', href: '/admin/clients', label: 'Clientes' });
  }
  return items;
}
