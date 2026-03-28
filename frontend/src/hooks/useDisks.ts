import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useDisks() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['disks', activeCluster, activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/disks`
      )
      return data
    },
  })
}
