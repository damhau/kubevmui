import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/networks" element={<NetworksPage />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/ssh-keys" element={<SSHKeysPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
