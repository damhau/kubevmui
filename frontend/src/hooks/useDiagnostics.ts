import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useDiagnostics(namespace: string, vmName: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['vm-diagnostics', activeCluster, namespace, vmName],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/diagnostics`
      )
      return data
    },
    enabled: !!namespace && !!vmName,
    refetchInterval: 10000,
  })
}
