export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';

  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'never';

  const diffMs = Math.max(Date.now() - time, 0);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
