import { useState, useEffect, useRef } from 'react'
import apiClient from '@/lib/api-client'

interface PreviewResult {
  data: Array<{ kind: string; manifest: Record<string, unknown> }> | null
  isLoading: boolean
  error: string | null
}

export function usePreview(endpoint: string, payload: unknown, enabled: boolean): PreviewResult {
  const [data, setData] = useState<PreviewResult['data']>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()

    timerRef.current = setTimeout(async () => {
      setIsLoading(true)
      setError(null)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const { data: resp } = await apiClient.post(endpoint, payload, {
          signal: controller.signal,
        })
        if (!controller.signal.aborted) {
          setData(resp.resources)
          setIsLoading(false)
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          const e = err as { message?: string }
          setError(e.message ?? 'Preview failed')
          setIsLoading(false)
        }
      }
    }, 500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(payload), enabled])

  return { data, isLoading, error }
}
