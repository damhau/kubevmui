import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastContainer } from '@/components/ui/Toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { VMListPage } from '@/pages/VMListPage'
import { VMCreatePage } from '@/pages/VMCreatePage'
import { VMDetailPage } from '@/pages/VMDetailPage'
import { ConsolePage } from '@/pages/ConsolePage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { NetworksPage } from '@/pages/NetworksPage'
import { StoragePage } from '@/pages/StoragePage'
import { SSHKeysPage } from '@/pages/SSHKeysPage'
import { ImagesPage } from '@/pages/ImagesPage'
import { NodesPage } from '@/pages/NodesPage'
import { EventsPage } from '@/pages/EventsPage'
import { TemplateDetailPage } from '@/pages/TemplateDetailPage'
import { ImageDetailPage } from '@/pages/ImageDetailPage'
import { InterfaceDetailPage } from '@/pages/InterfaceDetailPage'
import { NetworkDetailPage } from '@/pages/NetworkDetailPage'
import { StorageDetailPage } from '@/pages/StorageDetailPage'
import { NodeDetailPage } from '@/pages/NodeDetailPage'
import { ClusterMetricsPage } from '@/pages/ClusterMetricsPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { CatalogPage } from '@/pages/CatalogPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastContainer />
        <Routes>
          {/* Public route - no shell */}
          <Route path="/login" element={<LoginPage />} />

          {/* App shell wrapping all main routes */}
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/vms" element={<VMListPage />} />
            <Route path="/vms/create" element={<VMCreatePage />} />
            <Route path="/vms/:namespace/:name/console" element={<ConsolePage />} />
            <Route path="/vms/:namespace/:name" element={<VMDetailPage />} />
            <Route path="/images" element={<ImagesPage />} />
            <Route path="/images/:namespace/:name" element={<ImageDetailPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/templates/:name" element={<TemplateDetailPage />} />
            <Route path="/networks" element={<NetworksPage />} />
            <Route path="/networks/interfaces/:name" element={<InterfaceDetailPage />} />
            <Route path="/networks/:namespace/:name" element={<NetworkDetailPage />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/storage/:namespace/:name" element={<StorageDetailPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/nodes/:name" element={<NodeDetailPage />} />
            <Route path="/ssh-keys" element={<SSHKeysPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/monitoring/cluster" element={<ClusterMetricsPage />} />
            <Route path="/monitoring/analytics" element={<AnalyticsPage />} />
            <Route path="/monitoring/audit" element={<AuditLogPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
