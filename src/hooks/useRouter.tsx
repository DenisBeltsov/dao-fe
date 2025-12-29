import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type RouterContextValue = {
  path: string
  navigate: (nextPath: string) => void
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined)

export const RouterProvider = ({ children }: { children: React.ReactNode }) => {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextPath: string) => {
    if (nextPath === path) {
      return
    }
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }, [path])

  const value = useMemo(() => ({ path, navigate }), [path, navigate])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export const useRouter = () => {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useRouter must be used within RouterProvider')
  }
  return context
}
