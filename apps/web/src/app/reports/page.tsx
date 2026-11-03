import { AuthBoundary } from '@/components/auth/auth-boundary';
import { ReportsPage } from '@/components/reports/reports-page';

export default function ReportsRoute() {
  return <AuthBoundary><ReportsPage /></AuthBoundary>;
}
