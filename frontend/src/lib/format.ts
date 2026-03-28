/**
 * Shared formatting utilities for dates, memory sizes, etc.
 */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function formatMemoryMb(mb: number | null | undefined): string {
  if (mb == null) return '—'
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} Gi`
  return `${mb} Mi`
}
