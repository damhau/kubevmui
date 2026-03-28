import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useTemplates() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['templates', activeCluster, activeNamespace],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/templates`
      )
      return data
    },
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  return useMutation({
    mutationFn: async (template: any) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${activeNamespace}/templates`,
        template,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  const { activeCluster, activeNamespace } = useUIStore()
  return useMutation({
    mutationFn: async (name: string) => {
      await apiClient.delete(`/clusters/${activeCluster}/namespaces/${activeNamespace}/templates/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
