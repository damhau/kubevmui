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

    try {
      await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${ns}/images/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round((e.loaded / e.total) * 50)
              setProgress(pct)
              if (e.loaded >= e.total) {
                setPhase('writing')
                setProgress(50)
              }
            }
          },
        },
      )
      setProgress(100)
      queryClient.invalidateQueries({ queryKey: ['images'] })
    } finally {
      setPhase('idle')
    }
  }

  return { upload, progress, isUploading, phase }
}
