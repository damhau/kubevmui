import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

const LoginPage = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0b', color: '#e4e4e7' }}>
    Login placeholder
  </div>
)

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
            <Route path="/dashboard" element={<div className="p-8 text-[var(--text)]">Dashboard</div>} />
            <Route path="/vms" element={<div className="p-8 text-[var(--text)]">VMs</div>} />
            <Route path="/vms/create" element={<div className="p-8 text-[var(--text)]">Create VM</div>} />
            <Route path="/templates" element={<div className="p-8 text-[var(--text)]">Templates</div>} />
            <Route path="/networks" element={<div className="p-8 text-[var(--text)]">Networks</div>} />
            <Route path="/storage" element={<div className="p-8 text-[var(--text)]">Storage</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
