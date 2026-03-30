import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export interface NetworkCR {
  name: string
  display_name: string
  description: string
  network_type: 'pod' | 'multus'
  interface_type: 'masquerade' | 'bridge'
  bridge_name: string
  vlan_id: number | null
  dhcp_enabled: boolean
  subnet: string | null
  gateway: string | null
  mac_spoof_check: boolean
  cni_config: string | null
  created_at: string | null
  raw_manifest: Record<string, unknown> | null
}

export interface NetworkCRCreate {
  name: string
  display_name: string
  description?: string
  network_type?: string
  bridge_name?: string
  vlan_id?: number | null
  dhcp_enabled?: boolean
  subnet?: string | null
  gateway?: string | null
  mac_spoof_check?: boolean
  cni_config?: string | null
}

export interface NetworkCRUpdate {
  display_name?: string
  description?: string
  bridge_name?: string
  vlan_id?: number | null
  dhcp_enabled?: boolean
  subnet?: string | null
  gateway?: string | null
  mac_spoof_check?: boolean
  cni_config?: string | null
}

export function useNetworkCRs() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['network-crs', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/network-crs`
      )
      return data as { items: NetworkCR[]; total: number }
    },
  })
}

export function useNetworkCR(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['network-cr', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/network-crs/${name}`
      )
      return data as NetworkCR
    },
    enabled: !!name,
  })
}

export function useCreateNetworkCR() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (body: NetworkCRCreate) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/network-crs`,
        body,
      )
      return data as NetworkCR
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-crs'] })
    },
  })
}

export function usePreviewNetworkCR() {
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (body: NetworkCRCreate) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/network-crs/preview`,
        body,
      )
      return data
    },
  })
}

export function useUpdateNetworkCR() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ name, body }: { name: string; body: NetworkCRUpdate }) => {
      const { data } = await apiClient.put(
        `/clusters/${activeCluster}/network-crs/${name}`,
        body,
      )
      return data as NetworkCR
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-crs'] })
    },
  })
}

export function useDeleteNetworkCR() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(
        `/clusters/${activeCluster}/network-crs/${name}`,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-crs'] })
    },
  })
}
