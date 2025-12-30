import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useAccountEffect, useSignMessage } from 'wagmi'
import axios from 'axios'
import { fetchNonce, verifySignature } from '../services/authService'
import { clearAuthToken, setAuthToken } from '../lib/authToken'

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
  const { address, chainId, isConnected, status: accountStatus } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<AuthStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const previousAddressRef = useRef<string | null>(null)

  useAccountEffect({
    onConnect(data) {
      previousAddressRef.current = data.address ?? null
    },
    onChange(data) {
      const nextAddress = data.address ?? null
      const previousAddress = previousAddressRef.current

      if (previousAddress && nextAddress && previousAddress !== nextAddress) {
        // Wallet account switched; expire the current auth session immediately.
        setError(null)
        setIsAuthenticated(false)
        setStatus('idle')
        clearAuthToken()
      }

      previousAddressRef.current = nextAddress
    },
    onDisconnect() {
      previousAddressRef.current = null
    },
  })

  useEffect(() => {
    if (!isConnected || !address) {
      setError(null)
      setIsAuthenticated(false)
      setStatus('idle')
      clearAuthToken()
      return
    }

    let cancelled = false

    const authenticate = async () => {
      setError(null)
      setIsAuthenticated(false)
      setStatus('requestingNonce')
      clearAuthToken()

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
        const { data: verifyResponse } = await verifySignature({
          address,
          signature,
          chainId,
        })
        if (cancelled) {
          return
        }
        if (!verifyResponse?.token) {
          throw new Error('Token was not provided by backend.')
        }
        setAuthToken(verifyResponse.token)
        setIsAuthenticated(true)
        setStatus('authenticated')
      } catch (authError) {
        if (cancelled) {
          return
        }
        setIsAuthenticated(false)
        setStatus('error')
        setError(getErrorMessage(authError))
        clearAuthToken()
      }
    }

    authenticate()

    return () => {
      cancelled = true
    }
  }, [address, chainId, isConnected, signMessageAsync, retryCount])

  // When MetaMask switches accounts, wagmi updates `address`/`isConnected` and the effect above re-runs.
  // We can also respond to the status itself for immediate UX feedback.
  useEffect(() => {
    if (accountStatus === 'disconnected') {
      setIsAuthenticated(false)
      setStatus('idle')
      clearAuthToken()
    }
  }, [accountStatus])

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
