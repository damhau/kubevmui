import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { theme } from '@/lib/theme'

export function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('Please enter a Kubernetes bearer token.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(token.trim())
      navigate('/dashboard')
    } catch {
      setError('Invalid token or authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: theme.login.bg,
        backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: theme.login.card,
          border: `1px solid ${theme.login.cardBorder}`,
          borderRadius: theme.radius.xl,
          padding: 40,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          animation: 'fadeInScale 0.3s ease-out',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: theme.radius.xl,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <svg width="26" height="26" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="5" height="4" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="9" y="3" width="5" height="4" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="2" y="9" width="5" height="4" rx="1" fill="white" fillOpacity="0.6" />
              <rect x="9" y="9" width="5" height="4" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: theme.typography.heading.fontFamily,
              color: theme.login.text,
              letterSpacing: '-0.02em',
            }}
          >
            kubevmui
          </span>
        </div>

        <h2
          style={{
            margin: '0 0 24px',
            fontSize: 16,
            fontWeight: 600,
            fontFamily: theme.typography.heading.fontFamily,
            color: theme.login.text,
            textAlign: 'center',
          }}
        >
          Sign in with Kubernetes Token
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: theme.login.textMuted,
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Bearer Token
            </label>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Kubernetes service account token here..."
              rows={5}
              style={{
                width: '100%',
                background: theme.login.inputBg,
                border: `1px solid ${theme.login.inputBorder}`,
                borderRadius: theme.radius.md,
                color: theme.login.text,
                fontSize: 13,
                padding: '10px 12px',
                fontFamily: theme.typography.mono.fontFamily,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 12px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: theme.radius.md,
                color: theme.status.error,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#4f46e5' : theme.accent,
              color: theme.button.primaryText,
              border: 'none',
              borderRadius: theme.radius.md,
              padding: '10px 14px',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
