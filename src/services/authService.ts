import type { Address } from 'viem'
import apiClient from '../lib/apiClient'

export type NonceResponse = {
  nonce: string
}

export const fetchNonce = (address: Address) =>
  apiClient.get<NonceResponse>('/auth/nonce', {
    params: { address },
  })

export type VerifySignaturePayload = {
  address: Address
  signature: string
  chainId?: number
}

export type VerifySignatureResponse = {
  success: boolean
  token: string
}

export const verifySignature = (payload: VerifySignaturePayload) =>
  apiClient.post<VerifySignatureResponse>('/auth/verify', payload)
