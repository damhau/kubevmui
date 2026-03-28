import { useState, useCallback } from 'react'
import apiClient from '@/lib/api-client'

interface User {
  username: string
  groups: string[]
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('kubevmui_user')
    return stored ? JSON.parse(stored) : null
  })

  const login = useCallback(async (token: string) => {
    const { data } = await apiClient.post('/auth/login', { token })
    const userData: User = { username: data.username, groups: data.groups }
    localStorage.setItem('kubevmui_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }, [])

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout')
    localStorage.removeItem('kubevmui_user')
    setUser(null)
  }, [])

  return { user, login, logout, isAuthenticated: !!user }
}
