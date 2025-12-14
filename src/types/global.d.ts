
export {}; // ensure module scope

declare global {
  interface Window {
	ethereum?: any;
  }
}

export type BalanceType = {
  decimals: number
  formatted: string
  symbol: string
  value: bigint
}
