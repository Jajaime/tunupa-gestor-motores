import { AuthBoundary } from '@/components/auth/auth-boundary';
import { MotorsAdmin } from '@/components/admin/motors-admin';

export default function AdminMotorsPage() {
  return <AuthBoundary><MotorsAdmin /></AuthBoundary>;
}
