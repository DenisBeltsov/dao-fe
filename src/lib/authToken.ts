const STORAGE_KEY = 'dao-fe.authToken'
let cachedToken: string | null = null
const isBrowser = typeof window !== 'undefined'

export const getAuthToken = () => {
  if (cachedToken !== null) {
    return cachedToken
  }
  if (!isBrowser) {
    return null
  }
  try {
    cachedToken = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    cachedToken = null
  }
  return cachedToken
}

export const setAuthToken = (token: string) => {
  cachedToken = token
  if (!isBrowser) {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // ignore storage errors
  }
}

export const clearAuthToken = () => {
  cachedToken = null
  if (!isBrowser) {
    return
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore storage errors
  }
}
