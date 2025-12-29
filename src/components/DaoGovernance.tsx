import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Address, getContract } from 'viem'
import { useAccount, usePublicClient, useWatchContractEvent, useWriteContract } from 'wagmi'
import { daoAbi, daoAddress } from '../config/daoConfig'
import { fetchAllProposals, type BackendProposal } from '../services/proposalsService'

type ProposalRow = {
  localId: string
  onchainId?: bigint
  description: string
  creator?: Address
  executed?: boolean
  status: 'pending' | 'confirmed'
  forVotes: bigint
  againstVotes: bigint
  createdAt?: bigint
  voteWindowEnd?: number
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
  forVotes: 0n,
  againstVotes: 0n,
  voteWindowEnd: undefined,
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
  forVotes: proposal.votesFor !== undefined ? BigInt(proposal.votesFor) : 0n,
  againstVotes: proposal.votesAgainst !== undefined ? BigInt(proposal.votesAgainst) : 0n,
  voteWindowEnd: undefined,
  voterStatuses: {},
})

const mapOnchainStruct = (
  proposal: readonly [bigint, string, boolean, bigint, bigint, bigint, bigint | undefined],
  voteDurationMs: number,
): ProposalRow => ({
  localId: proposal[0].toString(),
  onchainId: proposal[0],
  description: proposal[1],
  executed: proposal[2],
  status: 'confirmed',
  forVotes: proposal[3],
  againstVotes: proposal[4],
  createdAt: proposal[5],
  voteWindowEnd:
    voteDurationMs > 0
      ? Number(proposal[5]) * 1000 + voteDurationMs
      : proposal[6]
        ? Number(proposal[6]) * 1000
        : undefined,
  voterStatuses: {},
})

const formatVotes = (value: bigint) => value.toString()

export const DaoGovernance = () => {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const daoReadContract = useMemo(() => {
    if (!publicClient) {
      return null
    }
    return getContract({
      address: daoAddress,
      abi: daoAbi,
      client: { public: publicClient },
    })
  }, [publicClient])
  const { writeContractAsync, isPending: isWritePending } = useWriteContract()

  const [proposals, setProposals] = useState<ProposalRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [createStatus, setCreateStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [voteStatuses, setVoteStatuses] = useState<Record<string, { status: VoteStatus; error?: string }>>({})
  const [executionStatuses, setExecutionStatuses] = useState<Record<string, { status: VoteStatus; error?: string }>>({})
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quorumThreshold, setQuorumThreshold] = useState<bigint>(0n)
  const [ownerAddress, setOwnerAddress] = useState<Address | null>(null)
  const [voteDurationMs, setVoteDurationMs] = useState<number>(0)

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
  (proposalId: bigint, voter: Address, support: boolean, weight: bigint) => {
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
            forVotes: support ? proposal.forVotes + weight : proposal.forVotes,
            againstVotes: support ? proposal.againstVotes : proposal.againstVotes + weight,
            voterStatuses: {
              ...proposal.voterStatuses,
              [voterKey]: support ? 'for' : 'against',
            },
          }
        }),
      )
    },
    [],
  )

  const refreshProposalFromChain = useCallback(
    async (proposalId: bigint) => {
      if (!daoReadContract) {
        return
      }
      try {
        const rawProposal = (await daoReadContract.read.getProposal([proposalId])) as readonly [
          bigint,
          string,
          boolean,
          bigint,
          bigint,
          bigint,
          bigint,
        ]
        upsertProposal(mapOnchainStruct(rawProposal, voteDurationMs))
      } catch (error) {
        console.error('Failed to refresh proposal from chain', error)
      }
    },
    [daoReadContract, upsertProposal, voteDurationMs],
  )

  const syncOnchainProposals = useCallback(
    async (proposalIds: bigint[]) => {
      if (!daoReadContract || proposalIds.length === 0) {
        return
      }
      await Promise.all(proposalIds.map((id) => refreshProposalFromChain(id)))
    },
    [daoReadContract, refreshProposalFromChain],
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
      const idsToSync = mapped
        .map((proposal) => proposal.onchainId)
        .filter((id): id is bigint => typeof id === 'bigint')
      syncOnchainProposals(idsToSync)
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
  }, [refreshNonce, syncOnchainProposals])

  useEffect(() => {
    if (!daoReadContract) {
      return
    }
    let cancelled = false
    const loadMeta = async () => {
      try {
        const [threshold, owner, duration] = await Promise.all([
          daoReadContract.read.quorumThreshold(),
          daoReadContract.read.owner(),
          daoReadContract.read.voteDuration(),
        ])
        if (cancelled) {
          return
        }
        setQuorumThreshold(threshold as bigint)
        setOwnerAddress(owner as Address)
        setVoteDurationMs(Number(duration) * 1000)
      } catch (error) {
        console.error('Failed to load DAO metadata', error)
      }
    }
    loadMeta()
    return () => {
      cancelled = true
    }
  }, [daoReadContract])

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
        refreshProposalFromChain(id)
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
        const weight = (args?.weight as bigint | undefined) ?? 0n
        if (!id || !voter) {
          return
        }
        updateVotes(id, voter, support, weight)
        refreshProposalFromChain(id)
      })
    },
  })

  useWatchContractEvent({
    address: daoAddress,
    abi: daoAbi,
    eventName: 'ProposalExecuted',
    onLogs: (logs) => {
      logs.forEach((log) => {
        const args = (log as { args?: Record<string, unknown> }).args
        const id = args?.id as bigint | undefined
        if (!id) {
          return
        }
        refreshProposalFromChain(id)
        setExecutionStatuses((prev) => ({
          ...prev,
          [id.toString()]: { status: 'success' },
        }))
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
      setVoteStatuses((prev) => ({
        ...prev,
        [idKey]: { status: 'success' },
      }))
    } catch (error) {
      setVoteStatuses((prev) => ({
        ...prev,
        [idKey]: { status: 'error', error: getErrorMessage(error) },
      }))
    }
  }

  const handleExecute = async (proposal: ProposalRow) => {
    if (!proposal.onchainId) {
      return
    }
    if (!isConnected || !address) {
      setExecutionStatuses((prev) => ({
        ...prev,
        [proposal.onchainId!.toString()]: { status: 'error', error: 'Connect wallet to execute.' },
      }))
      return
    }
    const idKey = proposal.onchainId.toString()
    setExecutionStatuses((prev) => ({
      ...prev,
      [idKey]: { status: 'pending' },
    }))
    try {
      await writeContractAsync({
        account: address,
        address: daoAddress,
        abi: daoAbi,
        functionName: 'executeProposal',
        args: [proposal.onchainId],
      })
      setExecutionStatuses((prev) => ({
        ...prev,
        [idKey]: { status: 'success' },
      }))
      setProposals((prev) =>
        prev.map((current) =>
          current.onchainId?.toString() === idKey
            ? { ...current, executed: true }
            : current,
        ),
      )
      refreshProposalFromChain(proposal.onchainId)
    } catch (error) {
      setExecutionStatuses((prev) => ({
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
            proposalVoteStatus?.status === 'pending' ||
            proposal.executed

          const totalVotes = proposal.forVotes + proposal.againstVotes
          const quorumReached = quorumThreshold > 0n ? totalVotes >= quorumThreshold : false
          const voteWindowEndTimestamp = proposal.voteWindowEnd
          const voteWindowEnded =
            voteDurationMs === 0 || !voteWindowEndTimestamp || Date.now() >= voteWindowEndTimestamp
          const majorityFor = proposal.forVotes > proposal.againstVotes
          const isOwner = ownerAddress ? normalizeAddress(ownerAddress) === userAddressKey : false
          const executionStatus = proposal.onchainId
            ? executionStatuses[proposal.onchainId.toString()]
            : undefined
          const canExecute =
            Boolean(proposal.onchainId) &&
            !proposal.executed &&
            quorumReached &&
            voteWindowEnded &&
            majorityFor &&
            isOwner
          const executing = executionStatus?.status === 'pending'

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
                  <span className="for-votes">{formatVotes(proposal.forVotes)} For</span>&nbsp;/&nbsp;
                  <span className="against-votes">{formatVotes(proposal.againstVotes)} Against</span>
                </p>
                <p className="proposal-meta">
                  Total:&nbsp;
                  {formatVotes(totalVotes)} / {quorumThreshold > 0n ? formatVotes(quorumThreshold) : 'N/A'} needed
                </p>
                {proposal.createdAt && (
                  <p className="proposal-meta">
                    Voting closes:{' '}
                    {new Date(
                      proposal.voteWindowEnd ?? Number(proposal.createdAt) * 1000,
                    ).toLocaleString()}
                  </p>
                )}
                {proposal.executed && <p className="success-text">Proposal executed.</p>}
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

              {Boolean(proposal.onchainId) && !proposal.executed && (
                <div className="execute-box">
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={!canExecute || executing}
                    onClick={() => handleExecute(proposal)}
                  >
                    {executing ? 'Executing...' : 'Execute proposal'}
                  </button>
                  {!voteWindowEnded && voteDurationMs > 0 && (
                    <p className="helper-text">Voting window still active.</p>
                  )}
                  {!quorumReached && <p className="helper-text">Waiting for quorum.</p>}
                  {!majorityFor && quorumReached && <p className="helper-text">Proposal needs majority support.</p>}
                  {!isOwner && <p className="helper-text">Only DAO owner can execute.</p>}
                  {executionStatus?.status === 'error' && executionStatus.error && (
                    <p className="error-text">{executionStatus.error}</p>
                  )}
                  {executionStatus?.status === 'success' && <p className="success-text">Execution confirmed.</p>}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default DaoGovernance
