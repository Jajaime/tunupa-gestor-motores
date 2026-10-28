import { AuthBoundary } from '@/components/auth/auth-boundary';
import { ClientsAdmin } from '@/components/admin/clients-admin';

export default function ClientsPage() {
  return <AuthBoundary><ClientsAdmin /></AuthBoundary>;
}
