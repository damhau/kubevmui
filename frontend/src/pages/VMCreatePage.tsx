import { useNavigate } from 'react-router-dom'
import { VMCreateWizard } from '@/components/vm/VMCreateWizard'
import { theme } from '@/lib/theme'

export function VMCreatePage() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          background: theme.main.card,
          borderBottom: `1px solid ${theme.main.cardBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate('/vms')}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.text.dim,
            fontSize: 13,
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          ← VMs
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.text.heading }}>
          Create Virtual Machine
        </h1>
      </div>
      <VMCreateWizard
        onClose={() => navigate('/vms')}
        onSuccess={() => navigate('/vms')}
      />
    </div>
  )
}
