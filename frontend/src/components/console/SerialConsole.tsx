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
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    if (!terminalRef.current) return

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

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/console/${cluster}/${namespace}/${vmName}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setStatus('connected')
      term.focus()
    }

    ws.onmessage = (event: MessageEvent) => {
      term.write(event.data as string)
    }

    ws.onclose = () => {
      setStatus('disconnected')
      term.write('\r\n\x1b[33m--- Session disconnected ---\x1b[0m\r\n')
    }

    ws.onerror = () => {
      setStatus('error')
      term.write('\r\n\x1b[31m--- Connection error ---\x1b[0m\r\n')
    }

    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(terminalRef.current)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      term.dispose()
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
          <div style={{ fontSize: 14, color: '#e4e4e7' }}>
            Connecting to serial console...
          </div>
          <div style={{ fontSize: 12 }}>
            {vmName}
          </div>
        </div>
      )}
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
