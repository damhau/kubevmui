import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import 'xterm/css/xterm.css'

interface SerialConsoleProps {
  cluster: string
  namespace: string
  vmName: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export function SerialConsole({ cluster, namespace, vmName }: SerialConsoleProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const mountTimeRef = useRef(0)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    // Detect StrictMode rapid remount: if cleanup ran <100ms ago, this is the real mount
    const now = Date.now()
    const isStrictModeFirstMount = mountTimeRef.current === 0
    mountTimeRef.current = now

    // Schedule init with a small delay to let StrictMode cleanup run first
    const initTimer = setTimeout(() => {
      if (!terminalRef.current) return // component was unmounted during delay

      const term = new Terminal({
        theme: {
          background: '#0a0a0b',
          foreground: '#e4e4e7',
          cursor: '#6366f1',
          selectionBackground: '#6366f140',
        },
        fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
        fontSize: 14,
        cursorBlink: true,
        scrollback: 5000,
      })
      termRef.current = term

      const fitAddon = new FitAddon()
      fitRef.current = fitAddon
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(terminalRef.current)

      requestAnimationFrame(() => {
        try { fitAddon.fit() } catch { /* not ready */ }
      })

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/console/${cluster}/${namespace}/${vmName}`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        term.focus()
      }

      ws.onmessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          termRef.current?.write(new Uint8Array(event.data))
        } else {
          termRef.current?.write(event.data as string)
        }
      }

      ws.onclose = () => {
        setStatus('disconnected')
        try { termRef.current?.write('\r\n\x1b[33m--- Session disconnected ---\x1b[0m\r\n') } catch { /* */ }
      }

      ws.onerror = () => {
        setStatus('error')
        try { termRef.current?.write('\r\n\x1b[31m--- Connection error ---\x1b[0m\r\n') } catch { /* */ }
      }

      term.onData((data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(new TextEncoder().encode(data))
        }
      })

      const resizeObserver = new ResizeObserver(() => {
        try { fitRef.current?.fit() } catch { /* */ }
      })
      resizeObserver.observe(terminalRef.current)
      observerRef.current = resizeObserver
    }, isStrictModeFirstMount ? 50 : 0)

    return () => {
      clearTimeout(initTimer)
      observerRef.current?.disconnect()
      observerRef.current = null
      if (wsRef.current) {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close()
        wsRef.current = null
      }
      termRef.current?.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [cluster, namespace, vmName])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {status === 'connecting' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0b',
            zIndex: 10,
            color: '#a1a1aa',
            fontSize: 13,
            gap: 8,
          }}
        >
          <div style={{ fontSize: 14, color: '#e4e4e7' }}>Connecting to serial console...</div>
          <div style={{ fontSize: 12 }}>{vmName}</div>
        </div>
      )}
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
