import { TopBar } from '@/components/layout/TopBar'
import { FileText } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export function AuditLogPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar title="Audit Log" hideNamespace />
      <div className="page-content">
        <div className="page-container">
          <div className="card">
            <EmptyState
              icon={<FileText size={24} />}
              title="Audit Log Coming Soon"
              description="Track UI actions and cluster events with time range filtering."
            />
          </div>
        </div>
      </div>
    </div>
  )
}
