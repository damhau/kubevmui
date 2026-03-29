import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useNetworks() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['networks', activeCluster, activeNamespace],
    queryFn: async () => {
      const url = activeNamespace === '_all'
        ? `/clusters/${activeCluster}/networks/all`
        : `/clusters/${activeCluster}/namespaces/${activeNamespace}/networks`
      const { data } = await apiClient.get(url)
      return data
    },
  })
}

export function useNetwork(namespace: string, name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['network', activeCluster, namespace, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/networks/${name}`
      )
      return data
    },
    enabled: !!namespace && !!name,
  })
}

export function useAllNetworks() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['networks-all', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/networks/all`)
      return data
    },
  })
}

export function useCreateNetwork() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  return useMutation({
    mutationFn: async (network: any) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/networks`,
        network,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
  })
}

export function useDeleteNetwork() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/networks/${name}`,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
  })
}
