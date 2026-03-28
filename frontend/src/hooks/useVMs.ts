import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useVMs() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['vms', activeCluster, activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/vms`
      )
      return data
    },
    refetchInterval: 5000,
  })
}

export function useDashboard() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['dashboard', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/dashboard`)
      return data
    },
    refetchInterval: 10000,
  })
}

export function useVMAction() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, name, action }: { namespace: string; name: string; action: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${name}/${action}`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useCreateVM() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (vm: any) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${vm.namespace}/vms`,
        vm,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
