import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useNodes() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['nodes', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/nodes`)
      return data
    },
    refetchInterval: 15000,
  })
}

export function useNode(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['node', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/nodes/${name}`)
      return data
    },
    enabled: !!name,
    refetchInterval: 10000,
  })
}
