import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Chart as ChartJS, ArcElement, DoughnutController, Legend, Tooltip } from 'chart.js'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import type { Address } from 'viem'
import { daoAbi, daoAddress } from '../../config/daoConfig'
import { hoodiChainId } from '../../config/customNetworks'
import { fetchProposalById, type BackendProposal, type ProposalsResponse } from '../../services/proposalsService'
import { useRouter } from '../../hooks/useRouter'
import { formatTokenAmount } from '../../utils/tokenFormat'
import { useTokenMetadata } from '../../context/tokenMetadata'

ChartJS.register(DoughnutController, ArcElement, Tooltip, Legend)

type Props = {
  proposalId: string
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const pollProposalFromBackend = async (
  proposalId: number,
  timeoutMs = 10_000,
  intervalMs = 1_000,
): Promise<BackendProposal | null> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const proposal = await fetchProposalById(proposalId)
      if (proposal) {
        return proposal
      }
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 404) {
        console.warn('Failed to fetch updated proposal from backend', error)
      }
    }
    await sleep(intervalMs)
  }
  return null
}

const toBigInt = (value?: string | number | null) => {
  if (typeof value === 'string') {
    if (!value.trim()) {
      return 0n
    }
    try {
      return BigInt(value)
    } catch {
      return 0n
    }
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0n
    }
    return BigInt(Math.trunc(value))
  }
  return 0n
}

export const ProposalDetails = ({ proposalId }: Props) => {
  const numericId = Number(proposalId)
  const { navigate } = useRouter()
  const { decimals, voteDurationMs } = useTokenMetadata()
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending: isVotePending } = useWriteContract()
  const queryClient = useQueryClient()

  const [voteStatus, setVoteStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [voteError, setVoteError] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState<boolean | null>(null)
  const [isCheckingVote, setIsCheckingVote] = useState(false)
  const [daoOwner, setDaoOwner] = useState<Address | null>(null)
  const [isOwnerLoading, setIsOwnerLoading] = useState(true)
  const [canExecute, setCanExecute] = useState<boolean | null>(null)
  const [isCheckingExecution, setIsCheckingExecution] = useState(false)
  const [executeStatus, setExecuteStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [finalizeStatus, setFinalizeStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [isExecutionConfirmed, setIsExecutionConfirmed] = useState(false)

  const chartRef = useRef<HTMLCanvasElement | null>(null)
  const chartInstanceRef = useRef<ChartJS<'doughnut'> | null>(null)

  const {
    data: proposal,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['proposal', numericId],
    queryFn: () => fetchProposalById(numericId),
    enabled: Number.isFinite(numericId),
  })

  const votesFor = toBigInt(proposal?.votesFor)
  const votesAgainst = toBigInt(proposal?.votesAgainst)
  const voteWindowEnd =
    proposal?.createdAt && voteDurationMs > 0
      ? Number(proposal.createdAt) + voteDurationMs
      : null
  const voteWindowClosed = voteWindowEnd ? Date.now() > voteWindowEnd : false
  const supportsExecution = votesFor > votesAgainst
  const defeated = Boolean(proposal?.finalized && !proposal?.executed && !supportsExecution)
  const votingActive = proposal ? !proposal.executed && !proposal.finalized : false
  const isWrongNetwork = Boolean(isConnected && chainId && chainId !== hoodiChainId)
  const isOwnerWallet = daoOwner && address ? daoOwner.toLowerCase() === address.toLowerCase() : false
  const showExecuteAction = voteWindowClosed && !proposal?.executed && supportsExecution
  const showFinalizeAction = voteWindowClosed && !proposal?.executed && !proposal?.finalized && !supportsExecution
  const ownerChecksInProgress = isOwnerLoading

  const statusLabel = proposal?.executed
    ? 'Executed'
    : defeated
      ? 'Defeated'
      : proposal?.finalized
        ? 'Finalized'
        : 'Pending'
  const statusClass = proposal?.executed
    ? 'status-chip--confirmed'
    : defeated
      ? 'status-chip--defeated'
      : 'status-chip--pending'

  const voteChartData = useMemo(() => {
    if (proposal?.votesFor === undefined || proposal?.votesAgainst === undefined) {
      return null
    }
    const forVotesNumber = Number(proposal.votesFor ?? 0)
    const againstVotesNumber = Number(proposal.votesAgainst ?? 0)
    const sanitizedFor = Number.isFinite(forVotesNumber) ? forVotesNumber : 0
    const sanitizedAgainst = Number.isFinite(againstVotesNumber) ? againstVotesNumber : 0
    if (sanitizedFor <= 0 && sanitizedAgainst <= 0) {
      return null
    }
    return [sanitizedFor, sanitizedAgainst]
  }, [proposal?.votesFor, proposal?.votesAgainst])

  const upsertProposalCaches = (updated: BackendProposal) => {
    queryClient.setQueryData(['proposal', numericId], updated)
    queryClient.setQueryData(['proposals', 'list'], (existing: ProposalsResponse | undefined) => {
      if (!existing) {
        return {
          total: 1,
          proposals: [updated],
        }
      }
      const already = existing.proposals.some((item) => item.id === updated.id)
      const proposals = already
        ? existing.proposals.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...existing.proposals]
      return {
        total: already ? existing.total : existing.total + 1,
        proposals,
      }
    })
  }

  useEffect(() => {
    if (!publicClient) {
      setIsOwnerLoading(false)
      return
    }
    let cancelled = false
    const loadOwner = async () => {
      setIsOwnerLoading(true)
      try {
        const owner = await publicClient.readContract({
          address: daoAddress,
          abi: daoAbi,
          functionName: 'owner',
        })
        if (!cancelled) {
          setDaoOwner(owner as Address)
        }
      } catch (ownerError) {
        console.warn('Failed to load DAO owner', ownerError)
      } finally {
        if (!cancelled) {
          setIsOwnerLoading(false)
        }
      }
    }
    loadOwner()
    return () => {
      cancelled = true
    }
  }, [publicClient])

  useEffect(() => {
    if (!publicClient || !Number.isFinite(numericId) || !showExecuteAction) {
      setCanExecute(null)
      setIsCheckingExecution(false)
      return
    }
    let cancelled = false
    const checkExecution = async () => {
      setIsCheckingExecution(true)
      try {
        const result = await publicClient.readContract({
          address: daoAddress,
          abi: daoAbi,
          functionName: 'hasQuorum',
          args: [BigInt(numericId)],
        })
        if (!cancelled) {
          setCanExecute(Boolean(result))
        }
      } catch (quorumError) {
        console.warn('Failed to validate execution eligibility', quorumError)
        if (!cancelled) {
          setCanExecute(null)
        }
      } finally {
        if (!cancelled) {
          setIsCheckingExecution(false)
        }
      }
    }
    checkExecution()
    return () => {
      cancelled = true
    }
  }, [publicClient, numericId, showExecuteAction])

  useEffect(() => {
    if (!publicClient || !isConnected || !address || !Number.isFinite(numericId)) {
      setHasVoted(null)
      setIsCheckingVote(false)
      return
    }
    let cancelled = false
    const checkVoteStatus = async () => {
      setIsCheckingVote(true)
      try {
        const result = await publicClient.readContract({
          address: daoAddress,
          abi: daoAbi,
          functionName: 'hasVoted',
          args: [BigInt(numericId), address as Address],
        })
        if (!cancelled) {
          setHasVoted(Boolean(result))
        }
      } catch (readError) {
        console.warn('Failed to validate vote status', readError)
        if (!cancelled) {
          setHasVoted(null)
        }
      } finally {
        if (!cancelled) {
          setIsCheckingVote(false)
        }
      }
    }
    checkVoteStatus()
    return () => {
      cancelled = true
    }
  }, [publicClient, isConnected, address, numericId])

  useEffect(() => {
    if (!voteChartData || !chartRef.current) {
      chartInstanceRef.current?.destroy()
      chartInstanceRef.current = null
      return
    }
    const context = chartRef.current.getContext('2d')
    if (!context) {
      return
    }
    chartInstanceRef.current?.destroy()
    chartInstanceRef.current = new ChartJS(context, {
      type: 'doughnut',
      data: {
        labels: ['For', 'Against'],
        datasets: [
          {
            data: voteChartData,
            backgroundColor: ['rgba(5, 150, 105, 0.8)', 'rgba(239, 68, 68, 0.8)'],
            borderColor: ['rgba(5, 150, 105, 1)', 'rgba(239, 68, 68, 1)'],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
      },
    })
    return () => {
      chartInstanceRef.current?.destroy()
      chartInstanceRef.current = null
    }
  }, [voteChartData])

  let voteDisabledReason: string | null = null
  if (!isConnected) {
    voteDisabledReason = 'Connect your wallet to vote.'
  } else if (isWrongNetwork) {
    voteDisabledReason = 'Switch to the Hoodi network to vote.'
  } else if (isCheckingVote) {
    voteDisabledReason = 'Validating your voting status...'
  } else if (hasVoted) {
    voteDisabledReason = null
  } else if (!votingActive) {
    voteDisabledReason = proposal?.executed
      ? 'This proposal has already been executed.'
      : proposal?.finalized
        ? 'This proposal has been finalized.'
        : null
  }

  const handleVote = async (support: boolean) => {
    if (!proposal) {
      return
    }
    if (!isConnected || !address) {
      setVoteStatus('error')
      setVoteError('Connect your wallet to vote')
      return
    }
    if (isWrongNetwork) {
      setVoteStatus('error')
      setVoteError('Switch to the Hoodi network to vote')
      return
    }
    if (!votingActive) {
      setVoteStatus('error')
      setVoteError(proposal.finalized ? 'Proposal finalized' : 'Proposal already executed')
      return
    }
    if (hasVoted) {
      setVoteStatus('error')
      setVoteError('You have already voted on this proposal')
      return
    }
    setVoteStatus('pending')
    setVoteError(null)
    try {
      const txHash = await writeContractAsync({
        account: address,
        address: daoAddress,
        abi: daoAbi,
        functionName: 'vote',
        args: [BigInt(numericId), support],
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      setVoteStatus('success')
      setHasVoted(true)
      const syncedProposal = await pollProposalFromBackend(numericId)
      if (syncedProposal) {
        upsertProposalCaches(syncedProposal)
      } else {
        console.warn(`Proposal #${numericId} data was not updated within 10 seconds after voting.`)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proposal', numericId] }),
        queryClient.invalidateQueries({ queryKey: ['proposals', 'list'] }),
      ])
    } catch (error) {
      setVoteStatus('error')
      setVoteError(getErrorMessage(error))
    }
  }

  const handleExecute = async () => {
    if (!proposal) {
      return
    }
    if (!isConnected || !address) {
      setExecuteStatus('error')
      setExecuteError('Connect your wallet to execute proposals')
      return
    }
    if (isWrongNetwork) {
      setExecuteStatus('error')
      setExecuteError('Switch to the Hoodi network to execute')
      return
    }
    if (!isOwnerWallet) {
      setExecuteStatus('error')
      setExecuteError('Only the DAO owner can execute proposals')
      return
    }
    if (!voteWindowClosed) {
      setExecuteStatus('error')
      setExecuteError('Voting window is still open')
      return
    }
    if (!supportsExecution) {
      setExecuteStatus('error')
      setExecuteError('Execution requirements not met')
      return
    }
    if (canExecute === false) {
      setExecuteStatus('error')
      setExecuteError('Quorum requirements not met')
      return
    }
    setExecuteStatus('pending')
    setExecuteError(null)
    try {
      const txHash = await writeContractAsync({
        account: address,
        address: daoAddress,
        abi: daoAbi,
        functionName: 'executeProposal',
        args: [BigInt(numericId)],
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      setExecuteStatus('success')
      setIsExecutionConfirmed(true)
      const syncedProposal = await pollProposalFromBackend(numericId)
      if (syncedProposal) {
        upsertProposalCaches(syncedProposal)
      } else {
        console.warn(`Proposal #${numericId} execution not confirmed by backend within 10 seconds.`)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proposal', numericId] }),
        queryClient.invalidateQueries({ queryKey: ['proposals', 'list'] }),
      ])
    } catch (error) {
      setExecuteStatus('error')
      setExecuteError(getErrorMessage(error))
      setIsExecutionConfirmed(false)
    }
  }

  const handleFinalize = async () => {
    if (!proposal) {
      return
    }
    if (!isConnected || !address) {
      setFinalizeStatus('error')
      setFinalizeError('Connect your wallet to finalize proposals')
      return
    }
    if (isWrongNetwork) {
      setFinalizeStatus('error')
      setFinalizeError('Switch to the Hoodi network to finalize')
      return
    }
    if (!isOwnerWallet) {
      setFinalizeStatus('error')
      setFinalizeError('Only the DAO owner can finalize proposals')
      return
    }
    if (!voteWindowClosed) {
      setFinalizeStatus('error')
      setFinalizeError('Voting window is still open')
      return
    }
    if (proposal?.finalized) {
      setFinalizeStatus('error')
      setFinalizeError('Proposal already finalized')
      return
    }
    setFinalizeStatus('pending')
    setFinalizeError(null)
    try {
      await writeContractAsync({
        account: address,
        address: daoAddress,
        abi: daoAbi,
        functionName: 'finalizeProposal',
        args: [BigInt(numericId)],
      })
      setFinalizeStatus('success')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proposal', numericId] }),
        queryClient.invalidateQueries({ queryKey: ['proposals', 'list'] }),
      ])
    } catch (error) {
      setFinalizeStatus('error')
      setFinalizeError(getErrorMessage(error))
    }
  }

  if (!Number.isFinite(numericId)) {
    return (
      <div className="proposal-details">
        <p className="error-text">Invalid proposal id.</p>
        <button className="primary-btn secondary" onClick={() => navigate('/proposals')}>
          Back to proposals
        </button>
      </div>
    )
  }

  if (isLoading) {
    return <p className="helper-text">Loading proposal #{proposalId}...</p>
  }

  if (error) {
    return (
      <div className="proposal-details">
        <p className="error-text">
          Failed to load proposal. {error instanceof Error ? error.message : ''}
        </p>
        <button className="primary-btn secondary" onClick={() => navigate('/proposals')}>
          Back to proposals
        </button>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="proposal-details">
        <p className="helper-text">Proposal not found.</p>
        <button className="primary-btn secondary" onClick={() => navigate('/proposals')}>
          Back to proposals
        </button>
      </div>
    )
  }

  return (
    <div className="proposal-details">
      <button className="primary-btn secondary" onClick={() => navigate('/proposals')}>
        ← Back to proposals
      </button>
      <h3>Proposal #{proposal.id}</h3>
      <p className="proposal-description">{proposal.description}</p>
      <p className="proposal-meta">
        Status:{' '}
        <span className={`status-chip ${statusClass}`}>{statusLabel}</span>
      </p>
      {proposal.creator && (
        <p className="proposal-meta">
          Creator: <span className="monospace">{proposal.creator}</span>
        </p>
      )}
      {proposal.executor && (
        <p className="proposal-meta">
          Executor: <span className="monospace">{proposal.executor}</span>
        </p>
      )}

      {voteWindowEnd ? (
        <p className="proposal-meta">
          Voting closes:&nbsp;
          {new Date(voteWindowEnd).toLocaleString()}
        </p>
      ) : (
        <p className="helper-text">Voting window information is unavailable.</p>
      )}

      <div className="vote-results">
        <h4>Vote totals</h4>
        <div className="vote-results__grid">
          <div>
            <p className="label">Votes For</p>
            <p className="value">{formatTokenAmount(votesFor, decimals)}</p>
          </div>
          <div>
            <p className="label">Votes Against</p>
            <p className="value">{formatTokenAmount(votesAgainst, decimals)}</p>
          </div>
        </div>
      </div>

      {voteChartData && (
        <div className="vote-chart">
          <h4>Vote distribution</h4>
          <div className="vote-chart__canvas">
            <canvas ref={chartRef} aria-label="Votes chart" />
          </div>
        </div>
      )}

      {votingActive ? (
        <div className="proposal-actions vote-dialog">
          <h4>Vote on-chain</h4>
          <p className="helper-text">Cast your vote for this proposal without leaving the detail view.</p>
          <div className="vote-actions">
            <button
              type="button"
              className="primary-btn secondary"
              disabled={!isConnected || isWrongNetwork || isVotePending || isCheckingVote || Boolean(hasVoted)}
              onClick={() => handleVote(true)}
            >
              Vote For
            </button>
            <button
              type="button"
              className="primary-btn secondary"
              disabled={!isConnected || isWrongNetwork || isVotePending || isCheckingVote || Boolean(hasVoted)}
              onClick={() => handleVote(false)}
            >
              Vote Against
            </button>
          </div>
          {voteDisabledReason && <p className="helper-text">{voteDisabledReason}</p>}
          {hasVoted && <p className="success-text">You already cast your vote on this proposal.</p>}
          {voteStatus === 'pending' && <p className="helper-text">Submitting vote...</p>}
          {voteStatus === 'success' && <p className="success-text">Vote transaction sent.</p>}
          {voteStatus === 'error' && voteError && <p className="error-text">{voteError}</p>}
        </div>
      ) : (
        <p className="success-text">Voting completed for this proposal.</p>
      )}

      {voteWindowClosed && !proposal.executed && (
        <div className="proposal-actions execution-dialog">
          <h4>Post-vote actions</h4>
          {showFinalizeAction && (
            isOwnerWallet ? (
              <button
                type="button"
                className="primary-btn secondary"
                disabled={ownerChecksInProgress || finalizeStatus === 'pending'}
                onClick={handleFinalize}
              >
                {finalizeStatus === 'pending' ? 'Finalizing...' : 'Finalize proposal'}
              </button>
            ) : (
              <p className="helper-text">Only the DAO owner can finalize proposals.</p>
            )
          )}
          {showExecuteAction && (
            isOwnerWallet ? (
              <button
                type="button"
                className="primary-btn"
                disabled={
                  ownerChecksInProgress ||
                  executeStatus === 'pending' ||
                  isCheckingExecution ||
                  canExecute === false ||
                  proposal.executed ||
                  isExecutionConfirmed
                }
                onClick={handleExecute}
              >
                {executeStatus === 'pending' ? 'Executing...' : 'Execute proposal'}
              </button>
            ) : (
              <p className="helper-text">Only the DAO owner can execute proposals.</p>
            )
          )}
          {ownerChecksInProgress && <p className="helper-text">Verifying owner permissions...</p>}
          {!showFinalizeAction && defeated && <p className="warning-text">Proposal finalized on-chain as defeated.</p>}
          {!showExecuteAction && supportsExecution && proposal.finalized && !proposal.executed && (
            <p className="helper-text">Proposal finalized, but execution remains available for a passing vote.</p>
          )}
          {isCheckingExecution && <p className="helper-text">Validating quorum and eligibility...</p>}
          {finalizeStatus === 'success' && <p className="success-text">Proposal finalized.</p>}
          {finalizeStatus === 'error' && finalizeError && <p className="error-text">{finalizeError}</p>}
          {executeStatus === 'success' && <p className="success-text">Execution transaction sent.</p>}
          {executeStatus === 'error' && executeError && <p className="error-text">{executeError}</p>}
          {canExecute === false && <p className="warning-text">Quorum requirements were not met.</p>}
        </div>
      )}
    </div>
  )
}

export default ProposalDetails
