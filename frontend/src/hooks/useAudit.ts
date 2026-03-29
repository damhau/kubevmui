import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export function useAuditLog(limit: number = 50, resourceType?: string, action?: string) {
  return useQuery({
    queryKey: ['audit', limit, resourceType, action],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (resourceType) params.set('resource_type', resourceType)
      if (action) params.set('action', action)
      const { data } = await apiClient.get(`/audit/events?${params.toString()}`)
      return data
    },
    refetchInterval: 10000,
  })
}
