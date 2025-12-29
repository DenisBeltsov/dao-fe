import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, ArcElement, DoughnutController, Legend, Tooltip } from 'chart.js'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import type { Address } from 'viem'
import { daoAbi, daoAddress } from '../../config/daoConfig'
import { hoodiChainId } from '../../config/customNetworks'
import { fetchProposalById, fetchProposalResults } from '../../services/proposalsService'
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

export const ProposalDetails = ({ proposalId }: Props) => {
  const numericId = Number(proposalId)
  const { navigate } = useRouter()
  const { decimals, voteDurationMs } = useTokenMetadata()
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending: isVotePending } = useWriteContract()
  const [voteStatus, setVoteStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [voteError, setVoteError] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState<boolean | null>(null)
  const [isCheckingVote, setIsCheckingVote] = useState(false)
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

  const {
    data: results,
    isLoading: resultsLoading,
    error: resultsError,
  } = useQuery({
    queryKey: ['proposal-results', numericId],
    queryFn: () => fetchProposalResults(numericId),
    enabled: Number.isFinite(numericId) && Boolean(proposal?.executed),
  })

  const votingOpen = proposal ? !proposal.executed : false
  const voteWindowEnd =
    proposal?.createdAt && voteDurationMs > 0
      ? Number(proposal.createdAt) + voteDurationMs
      : null
  const hasVoteTotals =
    proposal?.votesFor !== undefined && proposal?.votesAgainst !== undefined
  const quorumSum =
    hasVoteTotals && proposal
      ? BigInt(proposal.votesFor ?? 0) + BigInt(proposal.votesAgainst ?? 0)
      : null
  const voteWindowClosed = voteWindowEnd ? Date.now() > voteWindowEnd : false
  const votingActive = votingOpen && !voteWindowClosed
  const isWrongNetwork = Boolean(isConnected && chainId && chainId !== hoodiChainId)
  const voteChartData = useMemo(() => {
    if (proposal?.votesFor === undefined || proposal?.votesAgainst === undefined) {
      return null
    }
    const forVotes = Number(proposal.votesFor ?? 0)
    const againstVotes = Number(proposal.votesAgainst ?? 0)
    return [Number.isFinite(forVotes) ? forVotes : 0, Number.isFinite(againstVotes) ? againstVotes : 0]
  }, [proposal?.votesFor, proposal?.votesAgainst])

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
      : voteWindowClosed
        ? 'The voting window has closed.'
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
      setVoteError(voteWindowClosed ? 'Voting period has ended' : 'Proposal already executed')
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
      await writeContractAsync({
        account: address,
        address: daoAddress,
        abi: daoAbi,
        functionName: 'vote',
        args: [BigInt(numericId), support],
      })
      setVoteStatus('success')
      setHasVoted(true)
    } catch (error) {
      setVoteStatus('error')
      setVoteError(getErrorMessage(error))
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
        <span className={`status-chip status-chip--${proposal.executed ? 'confirmed' : 'pending'}`}>
          {proposal.executed ? 'Executed' : 'Pending'}
        </span>
      </p>
      {proposal.creator && (
        <p className="proposal-meta">
          Creator: <span className="monospace">{proposal.creator}</span>
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

      {quorumSum !== null && (
        <p className="proposal-meta">
          Total votes counted on-chain: {formatTokenAmount(quorumSum, decimals)}
        </p>
      )}
      {voteChartData && (
        <div className="vote-chart">
          <h4>Vote distribution</h4>
          <canvas ref={chartRef} aria-label="Votes chart" />
        </div>
      )}

      {proposal.executed && (
        <div className="vote-results">
          <h4>Final voting results</h4>
          {resultsLoading && <p className="helper-text">Loading results...</p>}
          {resultsError && (
            <p className="error-text">
              Failed to load results. {resultsError instanceof Error ? resultsError.message : ''}
            </p>
          )}
          {results && (
            <div className="vote-results__grid">
              <div>
                <p className="label">Votes For</p>
              <p className="value">{formatTokenAmount(results.votesFor, decimals)}</p>
              </div>
              <div>
                <p className="label">Votes Against</p>
              <p className="value">{formatTokenAmount(results.votesAgainst, decimals)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {votingOpen ? (
        <div className="proposal-actions vote-dialog">
          <h4>Vote on-chain</h4>
          <p className="helper-text">Cast your vote for this proposal without leaving the detail view.</p>
          <div className="vote-actions">
            <button
              type="button"
              className="primary-btn secondary"
              disabled={!votingActive || !isConnected || isWrongNetwork || isVotePending || isCheckingVote || Boolean(hasVoted)}
              onClick={() => handleVote(true)}
            >
              Vote For
            </button>
            <button
              type="button"
              className="primary-btn secondary"
              disabled={!votingActive || !isConnected || isWrongNetwork || isVotePending || isCheckingVote || Boolean(hasVoted)}
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
    </div>
  )
}

export default ProposalDetails
