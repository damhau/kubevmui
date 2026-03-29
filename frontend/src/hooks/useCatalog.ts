import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export interface CatalogImage {
  source_type: string
  source_url: string
  default_size_gb: number
}

export interface CatalogTemplate {
  name: string
  display_name: string
  cpu_cores: number
  memory_mb: number
  disk_size_gb: number | null
}

export interface CatalogEntry {
  name: string
  display_name: string
  description: string
  category: string
  os_type: string
  icon: string
  maintainer: string
  image: CatalogImage
  cloud_init_user_data: string | null
  templates: CatalogTemplate[]
}

export interface TemplateStatus {
  name: string
  variant: string
  exists: boolean
}

export interface CatalogStatus {
  provisioned: boolean
  image: { name: string; phase: string; progress: string } | null
  templates: TemplateStatus[]
}

export function useCatalogEntries() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['catalog', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/catalog`)
      return data as { items: CatalogEntry[]; total: number }
    },
  })
}

export function useCatalogEntry(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['catalog', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/catalog/${name}`)
      return data as CatalogEntry
    },
    enabled: !!name,
  })
}

export function useCatalogStatus(name: string, namespace: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['catalog-status', activeCluster, name, namespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/catalog/${name}/status?namespace=${namespace}`
      )
      return data as CatalogStatus
    },
    enabled: !!name && !!namespace && namespace !== '_all',
    refetchInterval: 5000,
  })
}

export function useProvisionCatalog() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ name, body }: {
      name: string
      body: { namespace: string; storage_class: string; templates: string[]; is_global?: boolean }
    }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/catalog/${name}/provision`,
        body
      )
      return data as { image_name: string; template_names: string[] }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-status'] })
      queryClient.invalidateQueries({ queryKey: ['images'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
