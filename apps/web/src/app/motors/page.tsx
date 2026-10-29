import { AuthBoundary } from '@/components/auth/auth-boundary';
import { MotorsList } from '@/components/motors/motors-list';

export default function MotorsPage() {
  return <AuthBoundary><MotorsList /></AuthBoundary>;
}
