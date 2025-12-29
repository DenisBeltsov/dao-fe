import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import axios from 'axios'
import { fetchNonce, verifySignature } from '../services/authService'

type AuthStatus = 'idle' | 'requestingNonce' | 'awaitingSignature' | 'verifying' | 'authenticated' | 'error'

const statusText: Record<AuthStatus, string> = {
  idle: 'Connect your wallet to access the dApp.',
  requestingNonce: 'Requesting nonce from backend...',
  awaitingSignature: 'Awaiting wallet signature...',
  verifying: 'Verifying signature...',
  authenticated: 'Authenticated.',
  error: 'Authentication failed.',
}

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return (
      (typeof error.response?.data === 'object' && error.response?.data !== null && 'message' in error.response.data
        ? String((error.response.data as { message?: string }).message)
        : undefined) ?? error.message ?? 'Authentication failed'
    )
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Authentication failed'
}

type Props = {
  children: ReactNode
}

export const DAPPLayout = ({ children }: Props) => {
  const { address, chainId, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<AuthStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!isConnected || !address) {
      setError(null)
      setIsAuthenticated(false)
      setStatus('idle')
      return
    }

    let cancelled = false

    const authenticate = async () => {
      setError(null)
      setIsAuthenticated(false)
      setStatus('requestingNonce')

      try {
        const { data } = await fetchNonce(address)
        if (cancelled) {
          return
        }
        if (!data?.nonce) {
          throw new Error('Nonce was not provided by backend.')
        }
        setStatus('awaitingSignature')
        const signature = await signMessageAsync({
          account: address,
          message: data.nonce,
        })
        if (cancelled) {
          return
        }
        setStatus('verifying')
        await verifySignature({
          address,
          signature,
          chainId,
        })
        if (cancelled) {
          return
        }
        setIsAuthenticated(true)
        setStatus('authenticated')
      } catch (authError) {
        if (cancelled) {
          return
        }
        setIsAuthenticated(false)
        setStatus('error')
        setError(getErrorMessage(authError))
      }
    }

    authenticate()

    return () => {
      cancelled = true
    }
  }, [address, chainId, isConnected, signMessageAsync, retryCount])

  const message = useMemo(() => {
    if (!isConnected) {
      return 'Connect your wallet to access the dApp.'
    }
    if (status === 'error' && error) {
      return error
    }
    return statusText[status]
  }, [status, isConnected, error])

  const showRetry = isConnected && status === 'error'

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1)
  }

  return (
    <div className="dapp-layout">
      {isAuthenticated ? (
        children
      ) : (
        <div className="auth-fallback">
          <p className="label">dApp content</p>
          <p className="auth-status-text">{message}</p>
          {showRetry && (
            <button className="primary-btn secondary auth-retry" type="button" onClick={handleRetry}>
              Retry authentication
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default DAPPLayout
