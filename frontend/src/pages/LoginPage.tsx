import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

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
        background: '#1c1c1e',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#2a2a2e',
          border: '1px solid #3a3a3f',
          borderRadius: 12,
          padding: 40,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
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
              color: '#f0f0f0',
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
            color: '#f0f0f0',
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
                color: '#a1a1aa',
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
                background: '#2e2e33',
                border: '1px solid #3a3a3f',
                borderRadius: 6,
                color: '#e4e4e7',
                fontSize: 13,
                padding: '10px 12px',
                fontFamily: 'monospace',
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
                borderRadius: 6,
                color: '#ef4444',
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
              background: loading ? '#4f46e5' : '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
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
