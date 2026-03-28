import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  activeCluster: string
  activeNamespace: string
  toggleSidebar: () => void
  setActiveCluster: (cluster: string) => void
  setActiveNamespace: (ns: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeCluster: 'local',
  activeNamespace: 'default',
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActiveCluster: (cluster) => set({ activeCluster: cluster }),
  setActiveNamespace: (ns) => set({ activeNamespace: ns }),
}))
