import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'
import { TopBar } from '@/components/layout/TopBar'
import { theme } from '@/lib/theme'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Activity } from 'lucide-react'
import { useSortable } from '@/hooks/useSortable'

interface Event {
  timestamp: string
  type: string
  reason: string
  message: string
  namespace?: string
  involved_object_name: string
  involved_object_kind: string
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then

  if (diff < 0) return 'just now'

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: theme.radius.sm,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}1a`,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  )
}

const TIME_RANGES: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
]

function getTimeSince(range: string): string | undefined {
  if (!range) return undefined
  const now = new Date()
  const map: Record<string, number> = {
    '1h': 3600000,
    '6h': 6 * 3600000,
    '24h': 24 * 3600000,
    '7d': 7 * 24 * 3600000,
    '30d': 30 * 24 * 3600000,
  }
  const ms = map[range]
  if (!ms) return undefined
  return new Date(now.getTime() - ms).toISOString()
}

export function EventsPage() {
  const { activeCluster, activeNamespace } = useUIStore()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'All' | 'Warning'>('All')
  const [timeRange, setTimeRange] = useState('')

  const since = getTimeSince(timeRange)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['events', activeCluster, activeNamespace, since],
    queryFn: async () => {
      const url =
        activeNamespace === '_all'
          ? `/clusters/${activeCluster}/events`
          : `/clusters/${activeCluster}/namespaces/${activeNamespace}/events`
      const params = since ? `?since=${encodeURIComponent(since)}` : ''
      const res = await apiClient.get(`${url}${params}`)
      return res.data as { items: Event[]; total: number }
    },
    refetchInterval: 5000,
  })

  const events: Event[] = Array.isArray(data?.items) ? data.items : []

  const filtered = events.filter((ev) => {
    if (typeFilter === 'Warning' && ev.type !== 'Warning') return false
    if (search) {
      const q = search.toLowerCase()
      return (
        ev.message.toLowerCase().includes(q) ||
        ev.reason.toLowerCase().includes(q) ||
        ev.involved_object_name.toLowerCase().includes(q)
      )
    }
    return true
  })

  const { sorted: sortedEvents, sortConfig, requestSort } = useSortable(filtered, { column: 'timestamp', direction: 'desc' })

  const showNamespace = activeNamespace === '_all'

  const columns = [
    'Time',
    'Type',
    ...(showNamespace ? ['Namespace'] : []),
    'Kind',
    'Object',
    'Reason',
    'Message',
  ]

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: `1px solid ${active ? theme.accent : theme.main.inputBorder}`,
    background: active ? theme.accentLight : theme.main.card,
    color: active ? theme.accent : theme.text.secondary,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        title="Events"
        subtitle={data ? `${filtered.length} event${filtered.length !== 1 ? 's' : ''}` : undefined}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Auto-refresh indicator */}
            {isFetching && (
              <span
                title="Refreshing..."
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: theme.status.running,
                  display: 'inline-block',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            )}
          </div>
        }
      />

      <div className="page-content" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
        <div className="page-container">
          {/* Filters bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by message, reason, or object..."
              style={{
                flex: 1,
                minWidth: 200,
                background: theme.main.inputBg,
                border: `1px solid ${theme.main.inputBorder}`,
                borderRadius: theme.radius.md,
                color: theme.text.primary,
                fontSize: 13,
                padding: '7px 12px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => setTypeFilter('All')}
              style={filterBtnStyle(typeFilter === 'All')}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('Warning')}
              style={filterBtnStyle(typeFilter === 'Warning')}
            >
              Warning
            </button>
            <span style={{ width: 1, height: 20, background: theme.main.cardBorder, flexShrink: 0 }} />
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
                style={filterBtnStyle(timeRange === tr.value)}
              >
                {tr.label}
              </button>
            ))}
          </div>

          {/* Events table */}
          <div className="card">
            {isLoading ? (
              <TableSkeleton rows={8} cols={columns.length} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Activity size={24} />}
                title="No Events"
                description={
                  search || typeFilter !== 'All'
                    ? 'No events match your current filters.'
                    : 'No events found in this namespace.'
                }
              />
            ) : (
              <table className="table">
                <thead>
                  <tr className="table-header">
                    <th className={`table-header-cell-sortable${sortConfig.column === 'timestamp' ? ' active' : ''}`} onClick={() => requestSort('timestamp')}>
                      Time{sortConfig.column === 'timestamp' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${sortConfig.column === 'type' ? ' active' : ''}`} onClick={() => requestSort('type')}>
                      Type{sortConfig.column === 'type' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    {showNamespace && (
                      <th className={`table-header-cell-sortable${sortConfig.column === 'namespace' ? ' active' : ''}`} onClick={() => requestSort('namespace')}>
                        Namespace{sortConfig.column === 'namespace' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    )}
                    <th className={`table-header-cell-sortable${sortConfig.column === 'involved_object_kind' ? ' active' : ''}`} onClick={() => requestSort('involved_object_kind')}>
                      Kind{sortConfig.column === 'involved_object_kind' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${sortConfig.column === 'involved_object_name' ? ' active' : ''}`} onClick={() => requestSort('involved_object_name')}>
                      Object{sortConfig.column === 'involved_object_name' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className={`table-header-cell-sortable${sortConfig.column === 'reason' ? ' active' : ''}`} onClick={() => requestSort('reason')}>
                      Reason{sortConfig.column === 'reason' ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                    <th className="table-header-cell">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEvents.map((ev, i) => (
                    <tr
                      key={`${ev.timestamp}-${ev.involved_object_name}-${ev.reason}-${i}`}
                      className="table-row"
                      style={
                        i < 8
                          ? {
                              animation: `fadeInRow 0.3s ease-out both`,
                              animationDelay: `${0.05 + i * 0.04}s`,
                            }
                          : undefined
                      }
                    >
                      {/* Time */}
                      <td
                        className="table-cell"
                        style={{
                          color: theme.text.secondary,
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          fontFamily: theme.typography.mono.fontFamily,
                        }}
                        title={new Date(ev.timestamp).toLocaleString()}
                      >
                        {formatTimeAgo(ev.timestamp)}
                      </td>

                      {/* Type */}
                      <td className="table-cell">
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 12,
                            color:
                              ev.type === 'Warning'
                                ? theme.status.migrating
                                : theme.status.running,
                          }}
                        >
                          {ev.type}
                        </span>
                      </td>

                      {/* Namespace (conditional) */}
                      {showNamespace && (
                        <td className="table-cell">
                          <Badge label={ev.namespace ?? '—'} color={theme.accent} />
                        </td>
                      )}

                      {/* Kind */}
                      <td className="table-cell">
                        <Badge label={ev.involved_object_kind} color={theme.text.secondary} />
                      </td>

                      {/* Object */}
                      <td
                        className="table-cell"
                        style={{
                          color: theme.text.primary,
                          fontWeight: 500,
                          fontSize: 13,
                          fontFamily: theme.typography.mono.fontFamily,
                        }}
                      >
                        {ev.involved_object_name}
                      </td>

                      {/* Reason */}
                      <td
                        className="table-cell"
                        style={{
                          color: theme.text.primary,
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {ev.reason}
                      </td>

                      {/* Message */}
                      <td
                        className="table-cell"
                        style={{
                          color: theme.text.secondary,
                          fontSize: 13,
                          maxWidth: 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={ev.message}
                      >
                        {ev.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
