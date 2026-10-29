import type { AuthUser } from './types';

export interface SidebarItem {
  id: 'dashboard' | 'clients' | 'motors' | 'alarms';
  href: '/' | '/admin/clients' | '/motors' | '/alarms';
  label: string;
}

// Publicar solo rutas implementadas; restringir la administración por rol.
export function getSidebarItems(role: AuthUser['role'] | undefined): SidebarItem[] {
  const items: SidebarItem[] = [{
    id: 'dashboard',
    href: '/',
    label: role === 'ADMIN' ? 'Panel general — Admin' : 'Resumen del cliente',
  }];
  if (role === 'ADMIN') {
    items.push({ id: 'clients', href: '/admin/clients', label: 'Clientes' });
  }
  if (role === 'ADMIN' || role === 'OPERATOR' || role === 'VIEWER') {
    items.push({ id: 'motors', href: '/motors', label: 'Mis motores' });
    items.push({ id: 'alarms', href: '/alarms', label: 'Alarmas y eventos' });
  }
  return items;
}
