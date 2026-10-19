import { Dashboard } from '@/components/dashboard/dashboard';
import { AuthBoundary } from '@/components/auth/auth-boundary';

export default function Home() {
  return <AuthBoundary><Dashboard /></AuthBoundary>;
}
