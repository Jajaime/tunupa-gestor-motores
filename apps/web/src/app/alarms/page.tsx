import { AuthBoundary } from '@/components/auth/auth-boundary';
import { AlarmsPage } from '@/components/alarms/alarms-page';

export default function Page() {
  return <AuthBoundary><AlarmsPage /></AuthBoundary>;
}
