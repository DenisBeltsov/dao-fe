import apiClient from '../lib/apiClient'

export type BackendProposal = {
  id: number
  description: string
  executed: boolean
  creator?: string | null
  votesFor?: number
  votesAgainst?: number
  lastSupport?: boolean | null
  lastVoter?: string | null
}

export type ProposalsResponse = {
  total: number
  proposals: BackendProposal[]
}

export const fetchAllProposals = async () => {
  const { data } = await apiClient.get<ProposalsResponse>('/proposals')
  return data
}
