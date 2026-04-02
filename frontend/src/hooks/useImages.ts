import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useImages() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['images', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/images`)
      return data
    },
    refetchInterval: 5000,
  })
}

export function useImage(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['image', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/images/${name}`
      )
      return data
    },
    enabled: !!name,
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
  const { activeCluster } = useUIStore()
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
      storage_namespace?: string
      media_type?: string
    }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/images`,
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
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(
        `/clusters/${activeCluster}/images/${name}`
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })
}

export function useUploadImage() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
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
    storage_namespace?: string
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
    formData.append('storage_namespace', metadata.storage_namespace || 'default')
    formData.append('media_type', metadata.media_type || 'disk')

    let pollInterval: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      pollInterval = setInterval(async () => {
        try {
          const { data } = await apiClient.get(
            `/clusters/${activeCluster}/images/upload-progress/${metadata.name}`
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
      startPolling()

      await apiClient.post(
        `/clusters/${activeCluster}/images/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total && e.loaded < e.total) {
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
