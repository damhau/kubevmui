import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useImages() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['images', activeCluster, activeNamespace],
    queryFn: async () => {
      const url = activeNamespace === '_all'
        ? `/clusters/${activeCluster}/all/images`
        : `/clusters/${activeCluster}/namespaces/${activeNamespace}/images`
      const { data } = await apiClient.get(url)
      return data
    },
    refetchInterval: 5000,
  })
}

export function useImage(namespace: string, name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['image', activeCluster, namespace, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/images/${name}`
      )
      return data
    },
    enabled: !!namespace && !!name,
    refetchInterval: 5000,
  })
}

export function useStorageClasses() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['storage-classes', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/storage-classes`)
      return data
    },
  })
}

export function useCreateImage() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  const ns = activeNamespace === '_all' ? 'default' : activeNamespace
  return useMutation({
    mutationFn: async (body: {
      name: string
      display_name: string
      description?: string
      os_type?: string
      source_type?: string
      source_url?: string
      size_gb?: number
      storage_class?: string
      media_type?: string
      is_global?: boolean
    }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${ns}/images`,
        body
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })
}

export function useDeleteImage() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  const ns = activeNamespace === '_all' ? 'default' : activeNamespace
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${ns}/images/${name}`
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })
}

export function useUploadImage() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  const ns = activeNamespace === '_all' ? 'default' : activeNamespace
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'writing'>('idle')
  const [progressDetail, setProgressDetail] = useState<{ uploaded: number; total: number } | null>(null)
  const isUploading = phase !== 'idle'

  const upload = async (file: File, metadata: {
    name: string
    display_name: string
    description?: string
    os_type?: string
    size_gb: number
    storage_class?: string
    is_global?: boolean
    media_type?: string
  }) => {
    setPhase('uploading')
    setProgress(0)
    setProgressDetail(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', metadata.name)
    formData.append('display_name', metadata.display_name)
    formData.append('description', metadata.description || '')
    formData.append('os_type', metadata.os_type || 'linux')
    formData.append('size_gb', String(metadata.size_gb))
    formData.append('storage_class', metadata.storage_class || '')
    formData.append('is_global', String(metadata.is_global || false))
    formData.append('media_type', metadata.media_type || 'disk')

    // Poll server-side progress once the backend starts writing to CDI.
    // This is the real transfer (backend → K8s cluster).  The browser →
    // backend part (onUploadProgress) is usually fast (localhost in dev)
    // so we keep it as an indeterminate "receiving" state and let the
    // server-side poll drive 0-100%.
    let pollInterval: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      pollInterval = setInterval(async () => {
        try {
          const { data } = await apiClient.get(
            `/clusters/${activeCluster}/namespaces/${ns}/images/upload-progress/${metadata.name}`
          )
          const serverPct = data.percent ?? 0
          setProgress(serverPct)
          setProgressDetail({ uploaded: data.uploaded_bytes, total: data.total_bytes })
        } catch {
          // Progress endpoint may 404 if upload just finished
        }
      }, 2000)
    }

    try {
      // Start polling right away — the server creates the tracker before
      // streaming to CDI, so it will pick up progress as it becomes
      // available.  While the browser→backend transfer is ongoing the
      // tracker may not yet exist (404) which the poll silently ignores.
      startPolling()

      await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${ns}/images/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total && e.loaded < e.total) {
              // Browser → backend transfer in progress (often fast/localhost).
              // Show as "uploading" phase without a percentage — the real
              // progress comes from the server-side CDI transfer poll.
              setPhase('uploading')
            } else if (e.total && e.loaded >= e.total) {
              setPhase('writing')
            }
          },
        },
      )
      setProgress(100)
      queryClient.invalidateQueries({ queryKey: ['images'] })
    } finally {
      if (pollInterval) clearInterval(pollInterval)
      setPhase('idle')
      setProgressDetail(null)
    }
  }

  return { upload, progress, isUploading, phase, progressDetail }
}
