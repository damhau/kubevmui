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
      disk: { name: string; bus: string; size_gb?: number; storage_class?: string; pvc_name?: string; source_type: string; disk_type?: string; image_name?: string; image_namespace?: string; image?: string }
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

export function useRemoveDiskFromSpec() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, diskName }: { namespace: string; vmName: string; diskName: string }) => {
      const { data } = await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/disks/${diskName}`
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
    mutationFn: async ({ namespace, vmName, name, networkCR }: { namespace: string; vmName: string; name: string; networkCR: string }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/interfaces`,
        { name, network_cr: networkCR }
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

export function useRemoveInterfaceFromSpec() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, ifaceName }: { namespace: string; vmName: string; ifaceName: string }) => {
      const { data } = await apiClient.delete(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/nics/${ifaceName}`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useEditDisk() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, diskName, updates }: {
      namespace: string
      vmName: string
      diskName: string
      updates: { bus?: string; boot_order?: number | null }
    }) => {
      const { data } = await apiClient.patch(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/disks/${diskName}`,
        updates
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useEditInterface() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, ifaceName, updates }: {
      namespace: string
      vmName: string
      ifaceName: string
      updates: { model?: string; mac_address?: string; network_cr?: string }
    }) => {
      const { data } = await apiClient.patch(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/nics/${ifaceName}`,
        updates
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useAddInterfaceToSpec() {
  const queryClient = useQueryClient()
  const { activeCluster } = useUIStore()
  return useMutation({
    mutationFn: async ({ namespace, vmName, iface }: {
      namespace: string
      vmName: string
      iface: { name: string; network_cr: string; model?: string; mac_address?: string }
    }) => {
      const { data } = await apiClient.post(
        `/clusters/${activeCluster}/namespaces/${namespace}/vms/${vmName}/nics`,
        iface
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vm'] })
      queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
