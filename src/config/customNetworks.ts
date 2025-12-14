import {AppKitNetwork} from "@reown/appkit/networks";

export const HOODI_SCAN = "https://hoodi.etherscan.io/"

const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_KEY;

export const hoodi: AppKitNetwork = {
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
