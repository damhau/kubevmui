import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export interface KubeVirtCondition {
  type: string
  status: string
  reason: string
  message: string
  last_transition_time: string | null
}

export interface KubeVirtComponent {
  name: string
  resource: string
  namespace: string | null
}

export interface KubeVirtInfo {
  phase: string
  operator_version: string
  observed_version: string
  target_version: string
  registry: string
  default_architecture: string
  outdated_workloads: number
  feature_gates: string[]
  conditions: KubeVirtCondition[]
  components: KubeVirtComponent[]
  infra_replicas: number | null
  created_at: string | null
}

export function useKubeVirtInfo() {
  const { activeCluster } = useUIStore()
  return useQuery<KubeVirtInfo>({
    queryKey: ['kubevirt-info', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/kubevirt-info`)
      return data
    },
    refetchInterval: 30000,
  })
}
