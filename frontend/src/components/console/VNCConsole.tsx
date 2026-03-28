import { useEffect, useRef, useState } from 'react'
import RFB from '@novnc/novnc/lib/rfb'

interface VNCConsoleProps {
  cluster: string
  namespace: string
  vmName: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export function VNCConsole({ cluster, namespace, vmName }: VNCConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<RFB | null>(null)
  const cleanedUp = useRef(false)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    if (!containerRef.current) return
    cleanedUp.current = false

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/vnc/${cluster}/${namespace}/${vmName}`

    setStatus('connecting')
    setErrorMessage('')

    let rfb: RFB
    try {
      rfb = new RFB(containerRef.current, wsUrl)
      rfb.scaleViewport = true
      rfb.resizeSession = true
      rfb.background = '#000000'
      rfbRef.current = rfb

      rfb.addEventListener('connect', () => {
        if (cleanedUp.current) return
        setStatus('connected')
      })

      rfb.addEventListener('disconnect', (e: Event) => {
        rfbRef.current = null
        if (cleanedUp.current) return
        const detail = (e as CustomEvent).detail
        if (detail?.clean) {
          setStatus('disconnected')
        } else {
          setStatus('error')
          setErrorMessage('Connection lost unexpectedly')
        }
      })

      rfb.addEventListener('credentialsrequired', () => {
        if (cleanedUp.current) return
        setErrorMessage('VM requires credentials')
      })
    } catch (err) {
      if (!cleanedUp.current) {
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Failed to connect')
      }
    }

    return () => {
      cleanedUp.current = true
      if (rfbRef.current) {
        rfbRef.current.disconnect()
        rfbRef.current = null
      }
    }
  }, [cluster, namespace, vmName])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {status !== 'connected' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            zIndex: 10,
            color: '#a1a1aa',
            fontSize: 13,
            gap: 8,
          }}
        >
          {status === 'connecting' && (
            <>
              <div style={{ fontSize: 14, color: '#e4e4e7' }}>
                Connecting to VNC...
              </div>
              <div style={{ fontSize: 12 }}>
                {vmName}
              </div>
            </>
          )}
          {status === 'disconnected' && (
            <div style={{ fontSize: 14, color: '#e4e4e7' }}>
              Disconnected from VNC
            </div>
          )}
          {status === 'error' && (
            <>
              <div style={{ fontSize: 14, color: '#ef4444' }}>
                VNC Connection Error
              </div>
              {errorMessage && (
                <div style={{ fontSize: 12 }}>{errorMessage}</div>
              )}
            </>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: '#000' }}
      />
    </div>
  )
}
