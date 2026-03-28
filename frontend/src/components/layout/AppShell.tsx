import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#1c1c1e',
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#f0f0f3',
          color: '#1c1c1e',
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
