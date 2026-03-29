import { useState } from 'react'
import { ChevronDown, ChevronRight, Code2 } from 'lucide-react'
import { YamlViewer } from './YamlViewer'
import { usePreview } from '@/hooks/usePreview'
import { theme } from '@/lib/theme'

interface YamlPreviewProps {
  endpoint: string
  payload: unknown
}

export function YamlPreview({ endpoint, payload }: YamlPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const { data, isLoading, error } = usePreview(endpoint, payload, expanded)

  const resources =
    data?.map((r) => ({
      label: r.kind || 'Resource',
      kind: r.kind,
      data: r.manifest,
    })) ?? []

  return (
    <div
      style={{
        marginTop: 16,
        border: `1px solid ${theme.main.inputBorder}`,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: theme.main.card,
          border: 'none',
          cursor: 'pointer',
          color: theme.text.secondary,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'inherit',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Code2 size={14} />
        YAML Preview
        {isLoading && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, opacity: 0.7 }}>
            Loading...
          </span>
        )}
      </button>
      {expanded && (
        <div style={{ borderTop: `1px solid ${theme.main.inputBorder}` }}>
          {error ? (
            <div style={{ padding: 14, color: theme.status.error, fontSize: 12 }}>{error}</div>
          ) : resources.length > 0 ? (
            <YamlViewer resources={resources} />
          ) : isLoading ? (
            <div style={{ padding: 14, color: theme.text.secondary, fontSize: 12 }}>
              Generating preview...
            </div>
          ) : (
            <div style={{ padding: 14, color: theme.text.secondary, fontSize: 12 }}>
              Fill in the form to see the YAML preview.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
