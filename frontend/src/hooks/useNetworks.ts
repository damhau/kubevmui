import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useNetworks() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['networks', activeCluster, activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/networks`
      )
      return data
    },
  })
}
