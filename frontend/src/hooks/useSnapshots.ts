import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useSnapshots(namespace: string, vmName?: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['snapshots', activeCluster, namespace, vmName],
    queryFn: async () => {
      const params = vmName ? `?vm=${vmName}` : ''
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/snapshots${params}`
      )
      return data
    },
    refetchInterval: 5000,
  })
}

export function useCreateSnapshot() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, snapshotName }: { namespace: string; vmName: string; snapshotName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/snapshots`,
        { name: snapshotName, vm_name: vmName }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })
}

export function useDeleteSnapshot() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, name }: { namespace: string; name: string }) => {
      await apiClient.delete(`/clusters/${activeCluster}/namespaces/${namespace}/snapshots/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })
}

export function useRestoreSnapshot() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, snapshotName }: { namespace: string; vmName: string; snapshotName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/snapshots/${snapshotName}/restore`,
        {},
        { timeout: 300_000 }, // 5 min — backend stops VM, restores, restarts
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
