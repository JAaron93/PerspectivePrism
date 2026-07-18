export function formatTimestamp(start: number | null, end: number | null): string {
  if (start === null) return 'N/A'
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  if (end === null) return formatTime(start)
  return `${formatTime(start)} - ${formatTime(end)}`
}
