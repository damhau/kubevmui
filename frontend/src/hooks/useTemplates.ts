import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useTemplates() {
  const { activeCluster, activeNamespace } = useUIStore()
  return useQuery({
    queryKey: ['templates', activeCluster, activeNamespace],
    queryFn: async () => {
      const url = activeNamespace === '_all'
        ? `/clusters/${activeCluster}/all/templates`
        : `/clusters/${activeCluster}/namespaces/${activeNamespace}/templates`
      const { data } = await apiClient.get(url)
      return data
    },
  })
}

export function useTemplate(name: string, namespace?: string) {
  const { activeCluster, activeNamespace } = useUIStore()
  const ns = namespace || activeNamespace
  return useQuery({
    queryKey: ['template', activeCluster, ns, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/namespaces/${ns}/templates/${name}`
      )
      return data
    },
    enabled: !!name,
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async (template: any) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/default/templates`,
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
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ name, namespace }: { name: string; namespace: string }) => {
      await apiClient.delete(`/clusters/${activeCluster}/namespaces/${namespace}/templates/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
