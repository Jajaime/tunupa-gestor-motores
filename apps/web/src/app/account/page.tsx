import { AuthBoundary } from '@/components/auth/auth-boundary';
import { AccountPage } from '@/components/account/account-page';

export default function MyAccountPage() {
  return <AuthBoundary><AccountPage /></AuthBoundary>;
}
