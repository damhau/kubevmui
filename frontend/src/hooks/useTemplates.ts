import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useTemplates() {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['templates', activeCluster],
    queryFn: async () => {
      const { data } = await apiClient.get(`/clusters/${activeCluster}/templates`)
      return data
    },
  })
}

export function useTemplate(name: string) {
  const { activeCluster } = useUIStore()
  return useQuery({
    queryKey: ['template', activeCluster, name],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/clusters/${activeCluster}/templates/${name}`
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
        `/clusters/${activeCluster}/templates`,
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
    mutationFn: async (name: string) => {
      await apiClient.delete(`/clusters/${activeCluster}/templates/${name}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
