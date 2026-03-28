import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useImages() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['images', activeCluster, activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/images`
      )
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
    }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/images`,
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
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/images/${name}`
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })
}
