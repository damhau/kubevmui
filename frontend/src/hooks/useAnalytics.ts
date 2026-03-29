import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useTopConsumers(metric: string = 'cpu', range: string = '24h', limit: number = 10) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['top-consumers', activeCluster, metric, range, limit],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/analytics/top-consumers?metric=${metric}&range=${range}&limit=${limit}`
      )
      return data
    },
    refetchInterval: 30000,
  })
}

export function useTrends(range: string = '7d') {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['trends', activeCluster, range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/analytics/trends?range=${range}`
      )
      return data
    },
    refetchInterval: 60000,
  })
}

export function useMigrationStats(range: string = '7d') {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['migration-stats', activeCluster, range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/analytics/migrations?range=${range}`
      )
      return data
    },
    refetchInterval: 60000,
  })
}
