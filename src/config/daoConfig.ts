import { type Abi, type Address, isAddress } from 'viem'
import daoArtifact from '../../daoABI.json'

const REQUIRED_DAO_ADDRESS = import.meta.env.VITE_DAO_ADDRESS

if (!REQUIRED_DAO_ADDRESS) {
  throw new Error('VITE_DAO_ADDRESS is not defined')
}

if (!isAddress(REQUIRED_DAO_ADDRESS)) {
  throw new Error('VITE_DAO_ADDRESS must be a valid address')
}

const baseAbi = (daoArtifact as { abi: Abi }).abi ?? []

const voteFragment = {
  type: 'function',
  name: 'vote',
  inputs: [
    {
      name: '_id',
      type: 'uint256',
      internalType: 'uint256',
    },
    {
      name: '_support',
      type: 'bool',
      internalType: 'bool',
    },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
} as const

const hasVoteFragment = baseAbi.some((item) => item.type === 'function' && item.name === 'vote')

export const daoAbi = (hasVoteFragment ? baseAbi : [...baseAbi, voteFragment]) as Abi
export const daoAddress = REQUIRED_DAO_ADDRESS as Address
