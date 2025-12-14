import {useEffect, useMemo, useState} from 'react'
import {type Address, getAddress, isAddress} from 'viem'
import {useAccount, useBalance} from 'wagmi'
import {customTokenAddress} from '../config/tokenConfig'

const LOCAL_STORAGE_KEY = 'dao-fe.customTokens'

const renderBalance = (formatted?: string, symbol?: string, isLoading?: boolean) => {
  if (isLoading) {
    return <span className="value">Loading…</span>
  }
  if (!formatted) {
    return <span className="value">-</span>
  }
  return <span className="value">{`${formatted} ${symbol ?? ''}`.trim()}</span>
}

type TokenRowProps = {
  token: Address
  enabled: boolean
  address?: Address
  chainId?: number
  removable: boolean
  onRemove?: (token: Address) => void
}

const TokenBalanceRow = ({
                           token,
                           enabled,
                           address,
                           chainId,
                           removable,
                           onRemove
                         }: TokenRowProps) => {
  const {data, isPending, status} = useBalance({
    address,
    chainId,
    token,
    query: {
      enabled,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    },
    watch: enabled,
  })

  return (
      <div className="token-row">
        <div className="token-row__meta">
          <p className="label">Token</p>
          <p className="monospace">{token}</p>
        </div>
        <div>
          <p className="label">Balance</p>
          {enabled ? (
              renderBalance(data?.formatted, data?.symbol, isPending || status === 'pending')
          ) : (
              <span className="value muted">Connect wallet to view</span>
          )}
        </div>
        {removable && (
            <button className="remove-token-btn" type="button" onClick={() => onRemove?.(token)}>
              Remove
            </button>
        )}
      </div>
  )
}

const readStoredTokens = (): Address[] => {
  if (typeof window === 'undefined') {
    return []
  }
  const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY)
  if (!stored) {
    return []
  }
  try {
    const parsed = JSON.parse(stored) as string[]
    return parsed.filter((token) => isAddress(token)) as Address[]
  } catch {
    return []
  }
}

export const BalanceDisplay = () => {
  const {address, chainId, isConnected} = useAccount()
  const enabled = Boolean(address && chainId && isConnected)
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [storedTokens, setStoredTokens] = useState<Address[]>(() => readStoredTokens())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(storedTokens))
  }, [storedTokens])

  const allTokens = useMemo(() => {
    const tokens = customTokenAddress ? [customTokenAddress, ...storedTokens] : storedTokens
    return Array.from(new Set(tokens))
  }, [storedTokens])

  const {
    data: nativeBalance,
    isPending: isNativePending,
    status: nativeStatus,
  } = useBalance({
    address,
    chainId,
    query: {
      enabled,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    },
    watch: enabled,
  })

  const handleAddToken = () => {
    setInputError(null)
    const trimmed = inputValue.trim()
    if (!trimmed) {
      setInputError('Enter ERC-20 token address')
      return
    }
    try {
      const normalized = getAddress(trimmed)
      if (storedTokens.includes(normalized)) {
        setInputError('Token already added')
        return
      }
      if (customTokenAddress && normalized === customTokenAddress) {
        setInputError('Token already available')
        return
      }
      setStoredTokens((prev) => [...prev, normalized])
      setInputValue('')
    } catch {
      setInputError('Invalid address')
    }
  }

  const handleRemoveToken = (token: Address) => {
    setStoredTokens((prev) => prev.filter((storedToken) => storedToken !== token))
  }

  return (
      <section className="balance-card">
        <div>
          <p className="label">Native token</p>
          {enabled ? (
              renderBalance(nativeBalance?.formatted, nativeBalance?.symbol, isNativePending || nativeStatus === 'pending')
          ) : (
              <span className="value muted">Connect wallet to view native balance.</span>
          )}
        </div>

        <div className="token-input-row">
          <div className="token-input-row__fields">
            <label htmlFor="tokenAddress" className="label">
              Custom token address
            </label>
            <input
                id="tokenAddress"
                className="token-input"
                placeholder="0x..."
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
            />
          </div>
          <button type="button" className="primary-btn secondary add-token-btn"
                  onClick={handleAddToken}>
            Add token
          </button>
        </div>
        {inputError && <p className="error-text">{inputError}</p>}

        <div className="token-list">
          {allTokens.length === 0 &&
              <p className="helper-text">Add ERC-20 addresses to monitor their balances.</p>}
          {allTokens.map((token) => (
              <TokenBalanceRow
                  key={token}
                  token={token}
                  enabled={Boolean(enabled && token)}
                  address={address}
                  chainId={chainId}
                  removable={!customTokenAddress || token !== customTokenAddress}
                  onRemove={handleRemoveToken}
              />
          ))}
        </div>
      </section>
  )
}

export default BalanceDisplay
