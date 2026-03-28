import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { theme } from '@/lib/theme'

export function AppShell() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: theme.login.bg,
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          background: theme.main.bg,
          color: theme.text.primary,
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
