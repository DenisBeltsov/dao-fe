import axios from 'axios'
import { getAuthToken } from './authToken'

const API_BASE_URL = import.meta.env.VITE_API_URL

if (!API_BASE_URL) {
  throw new Error('VITE_API_URL is not defined')
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default apiClient
