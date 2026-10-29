import { AuthBoundary } from '@/components/auth/auth-boundary';
import { MotorDetail } from '@/components/motors/motor-detail';

export default async function MotorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuthBoundary><MotorDetail motorId={id} /></AuthBoundary>;
}
