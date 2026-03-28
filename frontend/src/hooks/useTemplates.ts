import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useTemplates() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['templates', activeCluster, activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/templates`
      )
      return data
    },
  })
}
