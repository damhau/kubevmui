import { useState } from 'react'
import yaml from 'js-yaml'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'

function highlightYaml(yamlStr: string): string {
  return yamlStr
    .split('\n')
    .map((line) => {
      // Comment
      if (line.trimStart().startsWith('#')) {
        return `<span class="yaml-comment">${escapeHtml(line)}</span>`
      }
      // Key: value line
      const keyMatch = line.match(/^(\s*)([\w./-]+)(:)(.*)$/)
      if (keyMatch) {
        const [, indent, key, colon, rest] = keyMatch
        return `${indent}<span class="yaml-key">${escapeHtml(key)}</span><span class="yaml-separator">${colon}</span>${highlightValue(rest)}`
      }
      // List item
      const listMatch = line.match(/^(\s*)(- )(.*)$/)
      if (listMatch) {
        const [, indent, dash, rest] = listMatch
        // Check if it's a key-value after dash
        const kvMatch = rest.match(/^([\w./-]+)(:)(.*)$/)
        if (kvMatch) {
          const [, key, colon, val] = kvMatch
          return `${indent}<span class="yaml-separator">${dash}</span><span class="yaml-key">${escapeHtml(key)}</span><span class="yaml-separator">${colon}</span>${highlightValue(val)}`
        }
        return `${indent}<span class="yaml-separator">${dash}</span>${highlightValue(rest)}`
      }
      return escapeHtml(line)
    })
    .join('\n')
}

function highlightValue(val: string): string {
  const trimmed = val.trimStart()
  const leading = val.slice(0, val.length - trimmed.length)
  if (!trimmed) return ''
  if (trimmed === 'null' || trimmed === '~') return `${leading}<span class="yaml-null">${trimmed}</span>`
  if (trimmed === 'true' || trimmed === 'false') return `${leading}<span class="yaml-bool">${trimmed}</span>`
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `${leading}<span class="yaml-number">${trimmed}</span>`
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) return `${leading}<span class="yaml-string">${escapeHtml(trimmed)}</span>`
  if (trimmed.startsWith('#')) return `${leading}<span class="yaml-comment">${escapeHtml(trimmed)}</span>`
  return `${leading}<span class="yaml-string">${escapeHtml(trimmed)}</span>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface Resource {
  label: string
  kind?: string
  data: unknown
}

interface YamlViewerProps {
  resources: Resource[]
}

export function YamlViewer({ resources }: YamlViewerProps) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState(false)

  const allYaml = resources
    .map((r) => {
      try {
        return yaml.dump(r.data, { lineWidth: -1, noRefs: true, sortKeys: false })
      } catch {
        return JSON.stringify(r.data, null, 2)
      }
    })
    .join('\n---\n\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(allYaml).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const multiResource = resources.length > 1

  return (
    <div className="yaml-viewer">
      <div className="yaml-viewer-toolbar">
        <span className="yaml-viewer-toolbar-label">
          YAML
          {resources.length > 0 && ` \u00b7 ${resources.length} resource${resources.length > 1 ? 's' : ''}`}
        </span>
        <button className="yaml-viewer-copy" onClick={handleCopy}>
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>

      {resources.map((resource, idx) => {
        const isCollapsed = collapsed[idx] ?? false
        let yamlStr: string
        try {
          yamlStr = yaml.dump(resource.data, { lineWidth: -1, noRefs: true, sortKeys: false })
        } catch {
          yamlStr = JSON.stringify(resource.data, null, 2)
        }
        const lines = yamlStr.split('\n')
        const highlighted = highlightYaml(yamlStr)

        return (
          <div key={idx}>
            {multiResource && (
              <div
                className="yaml-resource-header"
                onClick={() => setCollapsed((s) => ({ ...s, [idx]: !s[idx] }))}
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {resource.label}
                {resource.kind && <span className="yaml-resource-kind">{resource.kind}</span>}
              </div>
            )}
            {!isCollapsed && (
              <div className="yaml-viewer-content">
                <div className="yaml-viewer-lines">
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <div
                  className="yaml-viewer-code"
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
