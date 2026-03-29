import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useNNCPs() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['nncps', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/nmstate/nncps`)
      return data
    },
    refetchInterval: 10000,
  })
}

export function useCreateNNCP() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (body: any) => {
      const { data } = await apiClient.post(`/clusters/${activeCluster}/nmstate/nncps`, body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nncps'] })
    },
  })
}

export function useDeleteNNCP() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(`/clusters/${activeCluster}/nmstate/nncps/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nncps'] })
    },
  })
}

export function useAvailableBridges() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['nmstate-bridges', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/nmstate/bridges`)
      return data
    },
  })
}

export function useNodeInterfaces() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['nmstate-interfaces', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/nmstate/interfaces`)
      return data
    },
    retry: false,
  })
}

export function useNodeNetworkState(nodeName: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['node-network-state', activeCluster, nodeName],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/nodes/${nodeName}/network-state`
      )
      return data
    },
    enabled: !!nodeName,
    retry: false, // Don't retry if nmstate not installed (404)
  })
}
