import { createContext, useContext, useState, type ReactNode } from 'react'

type TokenMetadata = {
  decimals: number
  setDecimals: (value: number) => void
  voteDurationMs: number
  setVoteDurationMs: (value: number) => void
}

const TokenMetadataContext = createContext<TokenMetadata | undefined>(undefined)

export const TokenMetadataProvider = ({ children }: { children: ReactNode }) => {
  const [decimals, setDecimals] = useState<number>(Number(import.meta.env.VITE_TOKEN_DECIMALS ?? 18))
  const [voteDurationMs, setVoteDurationMs] = useState<number>(0)

  return (
    <TokenMetadataContext.Provider value={{ decimals, setDecimals, voteDurationMs, setVoteDurationMs }}>
      {children}
    </TokenMetadataContext.Provider>
  )
}

export const useTokenMetadata = () => {
  const context = useContext(TokenMetadataContext)
  if (!context) {
    throw new Error('useTokenMetadata must be used inside TokenMetadataProvider')
  }
  return context
}
