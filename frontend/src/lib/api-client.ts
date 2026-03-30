import axios, { AxiosError } from 'axios'

const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export function extractErrorMessage(err: unknown, fallback = 'An error occurred'): string {
  if (err instanceof AxiosError && err.response?.data?.detail) {
    return err.response.data.detail
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}

export default apiClient
