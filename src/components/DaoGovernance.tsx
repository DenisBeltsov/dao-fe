import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Address } from 'viem'
import { useAccount, useWatchContractEvent, useWriteContract } from 'wagmi'
import { daoAbi, daoAddress } from '../config/daoConfig'
import { fetchAllProposals, type BackendProposal } from '../services/proposalsService'

type ProposalRow = {
  localId: string
  onchainId?: bigint
  description: string
  creator?: Address
  executed?: boolean
  status: 'pending' | 'confirmed'
  forVotes: number
  againstVotes: number
  voterStatuses: Record<string, 'for' | 'against'>
}

type VoteStatus = 'idle' | 'pending' | 'success' | 'error'

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const emptyProposal = (values?: Partial<ProposalRow>): ProposalRow => ({
  localId: createLocalId(),
  description: '',
  status: 'pending',
  forVotes: 0,
  againstVotes: 0,
  voterStatuses: {},
  ...values,
})

const normalizeAddress = (value?: Address | string) => value?.toLowerCase() ?? ''

const mapBackendProposal = (proposal: BackendProposal): ProposalRow => ({
  localId: proposal.id ? proposal.id.toString() : createLocalId(),
  onchainId: proposal.id !== undefined ? BigInt(proposal.id) : undefined,
  description: proposal.description ?? '',
  creator: (proposal.creator || undefined) as Address | undefined,
  executed: proposal.executed,
  status: 'confirmed',
  forVotes: proposal.votesFor ?? 0,
  againstVotes: proposal.votesAgainst ?? 0,
  voterStatuses: {},
})

export const DaoGovernance = () => {
  const { address, isConnected } = useAccount()
  const { writeContractAsync, isPending: isWritePending } = useWriteContract()

  const [proposals, setProposals] = useState<ProposalRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [createStatus, setCreateStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [voteStatuses, setVoteStatuses] = useState<Record<string, { status: VoteStatus; error?: string }>>({})
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const sortedProposals = useMemo(() => {
    return [...proposals].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      const aId = a.onchainId ?? -1n
      const bId = b.onchainId ?? -1n
      return Number(bId - aId)
    })
  }, [proposals])

  const upsertProposal = useCallback((nextProposal: ProposalRow) => {
    setProposals((prev) => {
      const result = [...prev]
      const nextId = nextProposal.onchainId?.toString()
      const normalizedCreator = normalizeAddress(nextProposal.creator)

      if (nextId) {
        const existingIndex = result.findIndex(
          (proposal) => proposal.onchainId && proposal.onchainId.toString() === nextId,
        )
        if (existingIndex >= 0) {
          result[existingIndex] = {
            ...result[existingIndex],
            ...nextProposal,
            status: 'confirmed',
            localId: nextId,
          }
          return result
        }
      }

      const pendingMatchIndex = result.findIndex(
        (proposal) =>
          proposal.status === 'pending' &&
          normalizeAddress(proposal.creator) === normalizedCreator &&
          proposal.description.trim() === nextProposal.description.trim(),
      )

      if (pendingMatchIndex >= 0) {
        result[pendingMatchIndex] = {
          ...result[pendingMatchIndex],
          ...nextProposal,
          status: 'confirmed',
          localId: nextId ?? result[pendingMatchIndex].localId,
        }
        return result
      }

      return [
        {
          ...nextProposal,
          status: nextProposal.onchainId ? 'confirmed' : nextProposal.status,
        },
        ...result,
      ]
    })
  }, [])

  const updateVotes = useCallback(
    (proposalId: bigint, voter: Address, support: boolean) => {
      const voteKey = proposalId.toString()

      setProposals((prev) =>
        prev.map((proposal) => {
          if (!proposal.onchainId || proposal.onchainId.toString() !== voteKey) {
            return proposal
          }
          const voterKey = normalizeAddress(voter)
          const alreadyCounted = proposal.voterStatuses[voterKey]
          if (alreadyCounted) {
            return proposal
          }
          return {
            ...proposal,
            forVotes: support ? proposal.forVotes + 1 : proposal.forVotes,
            againstVotes: support ? proposal.againstVotes : proposal.againstVotes + 1,
            voterStatuses: {
              ...proposal.voterStatuses,
              [voterKey]: support ? 'for' : 'against',
            },
          }
        }),
      )

      setVoteStatuses((prev) => ({
        ...prev,
        [voteKey]: { status: 'success' },
      }))
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    const loadFromBackend = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const payload = await fetchAllProposals()
        if (cancelled) {
          return
        }
        const mapped = payload.proposals.map(mapBackendProposal)
        setProposals(mapped)
      } catch (error) {
        if (cancelled) {
          return
        }
        console.error('Failed to fetch proposals from backend', error)
        setLoadError(getErrorMessage(error))
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadFromBackend()

    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  useWatchContractEvent({
    address: daoAddress,
    abi: daoAbi,
    eventName: 'ProposalCreated',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const args = (log as { args?: Record<string, unknown> }).args
        const id = args?.id as bigint | undefined
        const descriptionValue = String(args?.description ?? '')
        const creator = args?.creator as Address | undefined
        if (!id) {
          return
        }
        upsertProposal(
          emptyProposal({
            localId: id.toString(),
            onchainId: id,
            description: descriptionValue,
            creator,
            status: 'confirmed',
          }),
        )
      })
    },
  })

  useWatchContractEvent({
    address: daoAddress,
    abi: daoAbi,
    eventName: 'Voted',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const args = (log as { args?: Record<string, unknown> }).args
        const id = args?.id as bigint | undefined
        const voter = args?.voter as Address | undefined
        const support = Boolean(args?.support)
        if (!id || !voter) {
          return
        }
        updateVotes(id, voter, support)
      })
    },
  })

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!description.trim()) {
      setCreateError('Description is required')
      return
    }
    if (!isConnected || !address) {
      setCreateError('Connect your wallet to create proposals')
      return
    }
    const tempProposal = emptyProposal({
      description: description.trim(),
      creator: address,
      status: 'pending',
    })
    setCreateError(null)
    setCreateStatus('pending')
    setProposals((prev) => [tempProposal, ...prev])
    try {
      await writeContractAsync({
        account: address,
        address: daoAddress,
        abi: daoAbi,
        functionName: 'createProposal',
        args: [description.trim()],
      })
      setDescription('')
      setCreateStatus('success')
    } catch (error) {
      setCreateStatus('error')
      setCreateError(getErrorMessage(error))
      setProposals((prev) => prev.filter((proposal) => proposal.localId !== tempProposal.localId))
    }
  }

  const handleVote = async (proposal: ProposalRow, support: boolean) => {
    if (!proposal.onchainId) {
      return
    }
    if (!isConnected || !address) {
      setVoteStatuses((prev) => ({
        ...prev,
        [proposal.onchainId!.toString()]: {
          status: 'error',
          error: 'Connect wallet to vote',
        },
      }))
      return
    }

    const idKey = proposal.onchainId.toString()
    setVoteStatuses((prev) => ({
      ...prev,
      [idKey]: { status: 'pending' },
    }))

    try {
      await writeContractAsync({
        account: address,
        address: daoAddress,
        abi: daoAbi,
        functionName: 'vote',
        args: [proposal.onchainId, support],
      })
    } catch (error) {
      setVoteStatuses((prev) => ({
        ...prev,
        [idKey]: { status: 'error', error: getErrorMessage(error) },
      }))
    }
  }

  const userAddressKey = normalizeAddress(address)

  return (
    <section className="dao-card">
      <header>
        <p className="eyebrow">DAO Governance</p>
        <h2>Proposals & Voting</h2>
      </header>

      <form className="proposal-form" onSubmit={handleCreate}>
        <label htmlFor="proposalDescription" className="label">
          Proposal description
        </label>
        <textarea
          id="proposalDescription"
          className="proposal-input"
          placeholder="Describe your idea..."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={!isConnected || isWritePending}
          required
        />
        <button className="primary-btn" type="submit" disabled={!isConnected || !description.trim() || isWritePending}>
          {isWritePending && createStatus === 'pending' ? 'Creating...' : 'Create proposal'}
        </button>
        {createStatus === 'pending' && <p className="helper-text">Waiting for confirmation...</p>}
        {createStatus === 'success' && <p className="success-text">Proposal submitted. Awaiting confirmation.</p>}
        {createStatus === 'error' && createError && <p className="error-text">{createError}</p>}
      </form>

      <div className="proposal-list">
        <div className="proposal-list__header">
          <h3>Active proposals</h3>
          <button
            type="button"
            className="primary-btn secondary"
            onClick={() => setRefreshNonce((value) => value + 1)}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loadError && <p className="error-text">{loadError}</p>}
        {isLoading && proposals.length === 0 && <p className="helper-text">Loading proposals...</p>}

        {!isLoading && sortedProposals.length === 0 && (
          <p className="helper-text">No proposals yet. Be the first to create one!</p>
        )}

        {sortedProposals.map((proposal) => {
          const idLabel = proposal.onchainId !== undefined ? `#${proposal.onchainId}` : 'Pending...'
          const userVoteState = userAddressKey ? proposal.voterStatuses[userAddressKey] : undefined
          const proposalVoteStatus = proposal.onchainId
            ? voteStatuses[proposal.onchainId.toString()]
            : undefined
          const votingDisabled =
            !isConnected ||
            !proposal.onchainId ||
            proposal.status === 'pending' ||
            Boolean(userVoteState) ||
            proposalVoteStatus?.status === 'pending'

          return (
            <article key={proposal.localId} className="proposal-item">
              <div>
                <p className="label">Proposal {idLabel}</p>
                <p className="proposal-description">{proposal.description}</p>
                <p className="proposal-meta">
                  Status:{' '}
                  <span className={`status-chip status-chip--${proposal.status}`}>
                    {proposal.status === 'pending' ? 'Pending confirmation' : 'Confirmed'}
                  </span>
                </p>
                <p className="proposal-meta">
                  Votes:&nbsp;
                  <span className="for-votes">{proposal.forVotes} For</span>&nbsp;/&nbsp;
                  <span className="against-votes">{proposal.againstVotes} Against</span>
                </p>
                {userVoteState && <p className="success-text">You voted {userVoteState === 'for' ? 'For' : 'Against'}.</p>}
              </div>

              <div className="vote-actions">
                <button
                  type="button"
                  className="primary-btn secondary"
                  disabled={votingDisabled}
                  onClick={() => handleVote(proposal, true)}
                >
                  Vote For
                </button>
                <button
                  type="button"
                  className="primary-btn secondary"
                  disabled={votingDisabled}
                  onClick={() => handleVote(proposal, false)}
                >
                  Vote Against
                </button>
                {proposalVoteStatus?.status === 'pending' && (
                  <p className="helper-text">Submitting vote...</p>
                )}
                {proposalVoteStatus?.status === 'error' && proposalVoteStatus.error && (
                  <p className="error-text">{proposalVoteStatus.error}</p>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default DaoGovernance
