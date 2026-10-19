import { realtimeLabels } from '@/lib/realtime-session';
import type { RealtimeStatus as Status } from '@/lib/realtime-session';

export function RealtimeStatus({ status }: { status: Status }) {
  return <span className={`realtime-status realtime-${status}`} role="status">{realtimeLabels[status]}</span>;
}
