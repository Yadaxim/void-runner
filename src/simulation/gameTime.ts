/** Format in-game epoch (seconds) as a decorative stardate-style label. */
export function formatGameTime(epochSeconds: number): string {
  const totalHours = Math.floor(epochSeconds / 3600);
  const cycle = Math.floor(totalHours / 24) + 1;
  const hour = totalHours % 24;
  const minute = Math.floor((epochSeconds % 3600) / 60);
  return `Cycle ${cycle}.${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}`;
}
