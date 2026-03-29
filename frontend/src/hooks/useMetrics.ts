import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useVMMetrics(namespace: string, vmName: string, range: string = '1h') {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['vm-metrics', activeCluster, namespace, vmName, range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/metrics`,
        { params: { range } }
      )
      return data
    },
    enabled: !!namespace && !!vmName,
    refetchInterval: 30000,
  })
}

export function useVMTimeline(namespace: string, vmName: string, range: string = '1h') {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['vm-timeline', activeCluster, namespace, vmName, range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/timeline`,
        { params: { range } }
      )
      return data
    },
    enabled: !!namespace && !!vmName,
    refetchInterval: 30000,
  })
}

export function useNodeMetrics(nodeName: string, range: string = '1h') {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['node-metrics', activeCluster, nodeName, range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/nodes/${nodeName}/metrics`,
        { params: { range } }
      )
      return data
    },
    enabled: !!nodeName,
    refetchInterval: 30000,
  })
}

export function useClusterMetrics(range: string = '24h') {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['cluster-metrics', activeCluster, range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/metrics/overview`,
        { params: { range } }
      )
      return data
    },
    refetchInterval: 60000,
  })
}
