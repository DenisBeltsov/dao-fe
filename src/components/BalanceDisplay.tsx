import { useAccount, useBalance } from 'wagmi'
import { customTokenAddress } from '../config/tokenConfig'

const renderBalance = (formatted?: string, symbol?: string, isLoading?: boolean) => {
  if (isLoading) {
    return <span className="value">Loading…</span>
  }
  if (!formatted) {
    return <span className="value">-</span>
  }
  return <span className="value">{`${formatted} ${symbol ?? ''}`.trim()}</span>
}

export const BalanceDisplay = () => {
  const { address, chainId, isConnected } = useAccount()
  const enabled = Boolean(address && chainId && isConnected)

  const { data: nativeBalance, isPending: isNativePending } = useBalance({
    address,
    chainId,
    query: {
      enabled,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchInterval: enabled ? 15_000 : false,
    },
  })

  const {
    data: governanceBalance,
    isPending: isGovernancePending,
  } = useBalance({
    address,
    chainId,
    token: customTokenAddress,
    query: {
      enabled: Boolean(enabled && customTokenAddress),
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchInterval: enabled ? 15_000 : false,
    },
  })

  return (
    <section className="panel balance-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h3>Wallet balances</h3>
        </div>
        <p className="helper-text">Live balances auto-refresh every few seconds.</p>
      </div>
      <div className="balance-grid">
        <div className="balance-tile">
          <p className="label">Native token</p>
          {enabled ? (
            renderBalance(nativeBalance?.formatted, nativeBalance?.symbol, isNativePending)
          ) : (
            <span className="value muted">Connect wallet to view</span>
          )}
        </div>
        {customTokenAddress && (
          <div className="balance-tile">
            <p className="label">Governance token</p>
            <p className="monospace">{customTokenAddress}</p>
            {enabled ? (
              renderBalance(governanceBalance?.formatted, governanceBalance?.symbol, isGovernancePending)
            ) : (
              <span className="value muted">Connect wallet to view</span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default BalanceDisplay
