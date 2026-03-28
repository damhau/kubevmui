import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useMigrations(namespace: string, vmName?: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['migrations', activeCluster, namespace, vmName],
    queryFn: async () => {
      const params = vmName ? `?vm=${vmName}` : ''
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/migrations${params}`
      )
      return data
    },
    refetchInterval: 3000,
  })
}

export function useCreateMigration() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName }: { namespace: string; vmName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/migrate`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migrations'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useCancelMigration() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, name }: { namespace: string; name: string }) => {
      await apiClient.delete(`/clusters/${activeCluster}/namespaces/${namespace}/migrations/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migrations'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
