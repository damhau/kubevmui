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

export interface PersistentVolumeInfo {
  name: string
  capacity_gb: number
  phase: string
  access_modes: string[]
  reclaim_policy: string
  claim_name: string | null
  claim_namespace: string | null
  volume_mode: string
  raw_manifest: Record<string, unknown> | null
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

export function useDatastoreMetrics(name: string, range: string = '1h') {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['datastore-metrics', activeCluster, name, range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/datastores/${name}/metrics`,
        { params: { range } }
      )
      return data as Record<string, unknown>
    },
    enabled: !!name,
    refetchInterval: 30000,
  })
}

export function useDatastorePVs(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['datastore-pvs', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/datastores/${name}/pvs`)
      return data as { items: PersistentVolumeInfo[]; total: number }
    },
    enabled: !!name,
  })
}
