import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useDisks() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['disks', activeCluster, activeNamespace],
    queryFn: async () => {
      const url = activeNamespace === '_all'
        ? `/clusters/${activeCluster}/all/disks`
        : `/clusters/${activeCluster}/namespaces/${activeNamespace}/disks`
      const { data } = await apiClient.get(url)
      return data
    },
  })
}

export function useDisk(namespace: string, name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['disk', activeCluster, namespace, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/disks/${name}`
      )
      return data
    },
    enabled: !!namespace && !!name,
  })
}

export function useCreateDisk() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  const ns = activeNamespace === '_all' ? 'default' : activeNamespace
  return useMutation({
    mutationFn: async (disk: any) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${ns}/disks`,
        disk,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}

export function useDeleteDisk() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  const ns = activeNamespace === '_all' ? 'default' : activeNamespace
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${ns}/disks/${name}`,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disks'] })
    },
  })
}

export function useResizeDisk() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  const ns = activeNamespace === '_all' ? 'default' : activeNamespace
  return useMutation({
    mutationFn: async ({ name, size_gb }: { name: string; size_gb: number }) => {
      const { data } = await apiClient.patch(
        `/clusters/${activeCluster}/namespaces/${ns}/disks/${name}`,
        { size_gb },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disks'] })
      queryClient.invalidateQueries({ queryKey: ['disk'] })
    },
  })
}
