import { useMemo, useState } from 'react'
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from 'wagmi'
import './App.css'
import { HOODI_SCAN, hoodi, hoodiChainId } from './config/customNetworks'
import BalanceDisplay from './components/BalanceDisplay'
import DAPPLayout from './components/DAPPLayout'
import DaoGovernance from './components/DaoGovernance'
import ProposalsSection from './components/proposals/ProposalsSection'
import { RouterProvider } from './hooks/useRouter'
import { TokenMetadataProvider } from './context/tokenMetadata'

const shortenAddress = (address?: string | null) => {
  if (!address) {
    return ''
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const AddressAvatar = ({ address }: { address?: `0x${string}` }) => {
  if (!address) {
    return null
  }

  const color = `#${address.slice(2, 8)}`
  const initials = address.slice(2, 4).toUpperCase()

  return (
    <div className="wallet-avatar" style={{ backgroundColor: color }}>
      {initials}
    </div>
  )
}

function App() {
  const { address, status: accountStatus, chainId, isConnected } = useAccount()
  const {
    data: balanceData,
    isPending: isBalancePending,
  } = useBalance({
    address,
    query: {
      enabled: Boolean(address),
      staleTime: 5_000,
    },
  })
  const {
    connectAsync,
    connectors,
    error: connectError,
    isPending: isConnecting,
  } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching, error: switchError } = useSwitchChain()
  const [localError, setLocalError] = useState<string | null>(null)

  const preferredConnector = useMemo(() => {
    const injected = connectors.find((connector) => connector.id === 'injected' && connector.ready)
    if (injected) {
      return injected
    }
    const fallbackInjected = connectors.find((connector) => connector.id === 'injected')
    return fallbackInjected ?? connectors[0]
  }, [connectors])

  const connectDisabled = !preferredConnector || isConnecting
  const isWrongNetwork = Boolean(isConnected && chainId && chainId !== hoodiChainId)
  const networkLabel = chainId === hoodiChainId ? hoodi.name : 'Unsupported network'

  const handleConnect = async () => {
    if (!preferredConnector) {
      return
    }
    setLocalError(null)
    try {
      await connectAsync({ connector: preferredConnector })
    } catch (error) {
      if (error instanceof Error) {
        setLocalError(error.message)
      } else {
        setLocalError('Unable to connect wallet')
      }
    }
  }

  const handleDisconnect = () => {
    setLocalError(null)
    disconnect()
  }

  const handleSwitchNetwork = async () => {
    if (!switchChainAsync) {
      return
    }
    setLocalError(null)
    try {
      await switchChainAsync({ chainId: hoodiChainId })
    } catch (error) {
      if (error instanceof Error) {
        setLocalError(error.message)
      } else {
        setLocalError('Unable to switch network')
      }
    }
  }

  return (
    <main className="app-shell">
      <section className="wallet-card">
        <header>
          <h1>Hoodi wallet connection</h1>
        </header>

        <div className="status-row">
          <span className="status-label">Wallet status:</span>
          <span className={`status-pill status-pill--${accountStatus}`}>{accountStatus}</span>
        </div>

        {!isConnected ? (
          <button className="primary-btn" disabled={connectDisabled} onClick={handleConnect}>
            {preferredConnector?.name ? `Connect ${preferredConnector.name}` : 'Connect Wallet'}
          </button>
        ) : (
          <div className="connected-actions">
            <button className="primary-btn secondary" onClick={handleDisconnect}>
              Disconnect
            </button>
            {isWrongNetwork && (
              <button className="primary-btn" onClick={handleSwitchNetwork} disabled={isSwitching}>
                {isSwitching ? 'Switching...' : 'Switch to Hoodi'}
              </button>
            )}
          </div>
        )}

        {(localError || connectError || switchError) && (
          <p className="error-text">{localError ?? connectError?.message ?? switchError?.message}</p>
        )}
        {!preferredConnector && !isConnected && (
          <p className="helper-text">No wallet extension detected. Install MetaMask to continue.</p>
        )}

        <DAPPLayout>
          <TokenMetadataProvider>
            <RouterProvider>
              {isConnected && (
                <>
                  <div className="wallet-details">
                  <div className="wallet-details__header">
                    <AddressAvatar address={address} />
                    <div>
                      <p className="label">Address</p>
                      {address ? (
                        <a
                          href={`${HOODI_SCAN}address/${address}`}
                          className="address-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortenAddress(address)}
                        </a>
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                  </div>

                  <div className="wallet-grid">
                    <div>
                      <p className="label">Network</p>
                      <p className="value">{networkLabel}</p>
                    </div>
                    <div>
                      <p className="label">Chain ID</p>
                      <p className="value">{chainId ?? '-'}</p>
                    </div>
                    <div>
                      <p className="label">Balance</p>
                      <p className="value">
                        {isBalancePending
                          ? 'Loading…'
                          : `${balanceData?.formatted ?? '0'} ${balanceData?.symbol ?? 'ETH'}`}
                      </p>
                    </div>
                  </div>

                  {isWrongNetwork && (
                    <p className="warning-text">
                      Wrong network detected. Please switch to Hoodi (chainId {hoodiChainId}).
                    </p>
                  )}
                </div>

                <BalanceDisplay />
                <div id="dao-governance">
                  <DaoGovernance />
                </div>
                </>
              )}
              <ProposalsSection />
            </RouterProvider>
          </TokenMetadataProvider>
        </DAPPLayout>
      </section>
    </main>
  )
}

export default App
