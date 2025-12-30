
import apiClient from '../lib/apiClient'

export type BackendProposal = {
  id: number
  description: string
  executed: boolean
  finalized?: boolean
  creator?: string | null
  votesFor?: string | number
  votesAgainst?: string | number
  lastSupport?: boolean | null
  lastVoter?: string | null
  executor?: string | null
  createdAt?: number | null
}

export type ProposalsResponse = {
  total: number
  proposals: BackendProposal[]
}

export const fetchAllProposals = async () => {
  const { data } = await apiClient.get<ProposalsResponse>('/proposals')
  return data
}

export const fetchProposalById = async (proposalId: number | string) => {
  const { data } = await apiClient.get<BackendProposal>(`/proposals/${proposalId}`)
  return data
}
