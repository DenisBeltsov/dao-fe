import { AppKitNetwork } from '@reown/appkit/networks'
import { Chain } from 'viem'

export const HOODI_SCAN = 'https://hoodi.etherscan.io/'

const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_KEY

if (!ALCHEMY_KEY) {
  throw new Error('VITE_ALCHEMY_KEY is not defined')
}

export const hoodi: AppKitNetwork & Chain = {
  id: 560048,
  name: 'Ethereum Hoodi',
  nativeCurrency: {
    name: 'Hoodi Token',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [`https://eth-hoodi.g.alchemy.com/v2/${ALCHEMY_KEY}`],
      webSocket: ['wss://ethereum-hoodi-rpc.publicnode.com'],
    },
    public: {
      http: ['https://ethereum-hoodi-rpc.publicnode.com'],
      webSocket: ['wss://ethereum-hoodi-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Hoodi Explorer',
      url: HOODI_SCAN,
    },
  },
}

export const hoodiChainId = hoodi.id
export const hoodiRpcUrl = hoodi.rpcUrls.default.http[0]
