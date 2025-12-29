import { useEffect } from 'react'
import { useRouter } from '../../hooks/useRouter'
import ProposalsList from './ProposalsList'
import ProposalDetails from './ProposalDetails'

const normalizePath = (path: string) => (path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path)

export const ProposalsSection = () => {
  const { path, navigate } = useRouter()
  const currentPath = normalizePath(path)

  useEffect(() => {
    if (!currentPath.startsWith('/proposals')) {
      navigate('/proposals')
    }
  }, [currentPath, navigate])

  const detailMatch = currentPath.match(/^\/proposals\/(\d+)$/)

  return (
    <section className="dao-card">
      <header>
        <p className="eyebrow">Backend data</p>
        <h2>DAO proposals (REST)</h2>
      </header>
      {detailMatch ? <ProposalDetails proposalId={detailMatch[1]} /> : <ProposalsList />}
    </section>
  )
}

export default ProposalsSection
