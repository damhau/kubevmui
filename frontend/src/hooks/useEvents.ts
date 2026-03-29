import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useResourceEvents(namespace: string, resourceName: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['events', activeCluster, namespace, resourceName],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/events`
      )
      // Filter events related to this resource (exact match or prefix match)
      const items = (data.items || []).filter((e: any) =>
        e.involved_object_name === resourceName ||
        e.involved_object_name?.startsWith(`${resourceName}-`)
      )
      return items
    },
    enabled: !!namespace && !!resourceName,
    refetchInterval: 5000,
  })
}
