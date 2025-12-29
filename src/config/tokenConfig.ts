import { isAddress, type Address } from 'viem'

const rawCustomToken = import.meta.env.VITE_CUSTOM_TOKEN_ADDRESS

let parsedCustomToken: Address | undefined

if (rawCustomToken) {
  if (isAddress(rawCustomToken)) {
    parsedCustomToken = rawCustomToken
  } else {
    console.warn('VITE_CUSTOM_TOKEN_ADDRESS is not a valid address')
  }
}

export const customTokenAddress = parsedCustomToken
