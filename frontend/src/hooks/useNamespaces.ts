import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useNamespaces() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['namespaces', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/namespaces`)
      return data
    },
  })
}
