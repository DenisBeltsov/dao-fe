let tokenDecimals = Number(import.meta.env.VITE_TOKEN_DECIMALS ?? 18)

const toBigIntValue = (value: bigint | number | string) => {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0n
    }
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return 0n
    }
    try {
      return trimmed.startsWith('0x') ? BigInt(trimmed) : BigInt(trimmed)
    } catch {
      return 0n
    }
  }
  return 0n
}

export const formatTokenAmount = (value: bigint | number | string, decimals = tokenDecimals) => {
  const bigValue = toBigIntValue(value)
  if (decimals === 0) {
    return bigValue.toString()
  }
  const divisor = BigInt(10) ** BigInt(decimals)
  const whole = bigValue / divisor
  const fraction = bigValue % divisor
  if (fraction === 0n) {
    return whole.toString()
  }
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toString()}.${fractionStr}`
}

export const getTokenDecimals = () => tokenDecimals

export const setTokenDecimals = (nextDecimals: number) => {
  if (Number.isFinite(nextDecimals) && nextDecimals >= 0) {
    tokenDecimals = nextDecimals
  }
}
