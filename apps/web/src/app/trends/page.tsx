import { AuthBoundary } from '@/components/auth/auth-boundary';
import { TrendsPage } from '@/components/trends/trends-page';

export default function Page() {
  return <AuthBoundary><TrendsPage /></AuthBoundary>;
}
