import { AuthBoundary } from '@/components/auth/auth-boundary';
import { DevicesPage } from '@/components/devices/devices-page';

export default function Page() {
  return <AuthBoundary><DevicesPage /></AuthBoundary>;
}
