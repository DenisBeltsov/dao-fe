import { useEffect, useMemo, useState } from 'react'
import { getContract, type Address } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { daoAbi, daoAddress } from '../config/daoConfig'
import { erc20Abi } from '../config/erc20Abi'
import { useTokenMetadata } from '../context/tokenMetadata'
import { setTokenDecimals } from '../utils/tokenFormat'

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong'
}

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
  const { setDecimals, voteDurationMs, setVoteDurationMs } = useTokenMetadata()

  const [description, setDescription] = useState('')
  const [createStatus, setCreateStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [quorumThreshold, setQuorumThreshold] = useState<bigint>(0n)
  const [ownerAddress, setOwnerAddress] = useState<Address | null>(null)
  const [isOwnerLoading, setIsOwnerLoading] = useState(true)

  useEffect(() => {
    if (!daoReadContract) {
      setIsOwnerLoading(false)
      return
    }
    setIsOwnerLoading(true)
    let cancelled = false
    const loadMetadata = async () => {
      try {
        const [threshold, owner, duration, governanceTokenAddress] = await Promise.all([
          daoReadContract.read.quorumThreshold(),
          daoReadContract.read.owner(),
          daoReadContract.read.voteDuration(),
          daoReadContract.read.governanceToken(),
        ])
        if (cancelled) {
          return
        }
        setQuorumThreshold(threshold as bigint)
        setOwnerAddress(owner as Address)
        setVoteDurationMs(Number(duration) * 1000)

        if (governanceTokenAddress && publicClient) {
          try {
            const decimals = await publicClient.readContract({
              address: governanceTokenAddress as Address,
              abi: erc20Abi,
              functionName: 'decimals',
            })
            const numericDecimals = Number(decimals)
            setTokenDecimals(numericDecimals)
            setDecimals(numericDecimals)
          } catch (error) {
            console.warn('Failed to load governance token decimals', error)
          }
        }
      } catch (error) {
        console.error('Failed to load DAO metadata', error)
      } finally {
        if (!cancelled) {
          setIsOwnerLoading(false)
        }
      }
    }
    loadMetadata()
    return () => {
      cancelled = true
    }
  }, [daoReadContract, publicClient, setDecimals, setVoteDurationMs])

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
    const isCreatorOwner =
      ownerAddress && address ? ownerAddress.toLowerCase() === address.toLowerCase() : false
    if (!isCreatorOwner) {
      setCreateError('Only the DAO owner can create proposals')
      return
    }
    setCreateStatus('pending')
    setCreateError(null)
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
    }
  }

  const isOwner = ownerAddress && address ? ownerAddress.toLowerCase() === address.toLowerCase() : false

  return (
    <section className="dao-card">
      <header>
        <p className="eyebrow">On-chain actions</p>
        <h2>Create & manage proposals</h2>
      </header>

      {isOwnerLoading ? (
        <div className="proposal-actions">
          <h4>Validating permissions</h4>
          <p className="helper-text">Checking if your wallet can create proposals...</p>
        </div>
      ) : !address ? (
        <div className="proposal-actions">
          <h4>Connect wallet</h4>
          <p className="helper-text">Connect your wallet above to verify proposal creation permissions.</p>
        </div>
      ) : isOwner ? (
        <>
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
            <button className="primary-btn full-width" type="submit" disabled={!isConnected || !description.trim() || isWritePending}>
              {isWritePending && createStatus === 'pending' ? 'Creating...' : 'Create proposal'}
            </button>
            {createStatus === 'pending' && <p className="helper-text">Waiting for confirmation...</p>}
            {createStatus === 'success' && <p className="success-text">Proposal submitted. Awaiting confirmation.</p>}
            {createStatus === 'error' && createError && <p className="error-text">{createError}</p>}
          </form>

          <p className="helper-text">
            Publish the proposal, then manage voting & execution from the detail view once quorum is met.
          </p>
        </>
      ) : (
        <div className="proposal-actions restricted">
          <h4>Proposal creation restricted</h4>
          <p className="warning-text">Connected wallet is not the DAO owner.</p>
          {ownerAddress && (
            <p className="helper-text">
              DAO owner: <span className="monospace">{ownerAddress}</span>
            </p>
          )}
        </div>
      )}

      <div className="dao-meta-grid">
        <div className="meta-card">
          <p className="label">DAO owner</p>
          <p className="monospace">{ownerAddress ?? 'pending'}</p>
        </div>
        <div className="meta-card">
          <p className="label">Quorum threshold</p>
          <p className="value">{quorumThreshold > 0n ? quorumThreshold.toString() : 'pending'}</p>
        </div>
        <div className="meta-card">
          <p className="label">Vote duration</p>
          <p className="value">{voteDurationMs > 0 ? `${(voteDurationMs / 1000 / 60).toFixed(0)} min` : 'pending'}</p>
        </div>
      </div>
    </section>
  )
}

export default DaoGovernance
