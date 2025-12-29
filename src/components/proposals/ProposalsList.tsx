import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAllProposals } from '../../services/proposalsService'
import { useRouter } from '../../hooks/useRouter'

const statusLabel = (executed: boolean) => (executed ? 'Executed' : 'Pending')

export const ProposalsList = () => {
  const { navigate } = useRouter()
  const { data, isLoading, error } = useQuery({
    queryKey: ['proposals', 'list'],
    queryFn: fetchAllProposals,
  })

  const items = useMemo(() => data?.proposals ?? [], [data])

  if (isLoading) {
    return <p className="helper-text">Loading proposals from backend...</p>
  }

  if (error) {
    return <p className="error-text">Failed to load proposals. {error instanceof Error ? error.message : ''}</p>
  }

  if (items.length === 0) {
    return <p className="helper-text">No proposals published yet.</p>
  }

  return (
    <ul className="proposals-list">
      {items.map((proposal) => (
        <li key={proposal.id} className="proposal-card">
          <div>
            <p className="label">#{proposal.id}</p>
            <p className="proposal-description">{proposal.description}</p>
            <p className="proposal-meta">
              Status:{' '}
              <span className={`status-chip status-chip--${proposal.executed ? 'confirmed' : 'pending'}`}>
                {statusLabel(proposal.executed)}
              </span>
            </p>
          </div>
          <button type="button" className="primary-btn secondary" onClick={() => navigate(`/proposals/${proposal.id}`)}>
            View details
          </button>
        </li>
      ))}
    </ul>
  )
}

export default ProposalsList
