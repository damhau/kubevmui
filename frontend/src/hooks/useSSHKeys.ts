import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useSSHKeys() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['sshkeys', activeCluster, activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/sshkeys`
      )
      return data
    },
  })
}

export function useCreateSSHKey() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  return useMutation({
    mutationFn: async (body: { name: string; public_key: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/sshkeys`,
        body
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshkeys'] })
    },
  })
}

export function useDeleteSSHKey() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/sshkeys/${name}`
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshkeys'] })
    },
  })
}
