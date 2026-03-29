import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { useUIStore } from '@/stores/ui-store'

export function useAddVolume() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, name, pvcName, bus }: { namespace: string; vmName: string; name: string; pvcName: string; bus?: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/volumes`,
        { name, pvc_name: pvcName, bus: bus || 'scsi' }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useAddDiskToSpec() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, disk }: {
      namespace: string
      vmName: string
      disk: { name: string; bus: string; size_gb?: number; storage_class?: string; pvc_name?: string; source_type: string; image_name?: string; image_namespace?: string }
    }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/disks`,
        disk
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useRemoveVolume() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, volName }: { namespace: string; vmName: string; volName: string }) => {
      const { data } = await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/volumes/${volName}`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useAddInterface() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, name, nadName }: { namespace: string; vmName: string; name: string; nadName: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/interfaces`,
        { name, network_attachment_definition: nadName }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useRemoveInterface() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, ifaceName }: { namespace: string; vmName: string; ifaceName: string }) => {
      const { data } = await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/interfaces/${ifaceName}`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
