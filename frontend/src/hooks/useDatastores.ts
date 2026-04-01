import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export interface Datastore {
  name: string
  provisioner: string
  is_default: boolean
  reclaim_policy: string
  volume_binding_mode: string
  allow_expansion: boolean
  parameters: Record<string, string>
  pv_count: number
  total_capacity_gb: number
  available_capacity_gb: number | null
  provider_type: string
  provider_details: Record<string, unknown>
  raw_manifest: Record<string, unknown> | null
}

export function useDatastores() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['datastores', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/datastores`)
      return data as { items: Datastore[]; total: number }
    },
  })
}

export function useDatastore(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['datastore', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/datastores/${name}`)
      return data as Datastore
    },
    enabled: !!name,
  })
}
