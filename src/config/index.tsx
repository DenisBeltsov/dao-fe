import { createConfig, createStorage, http, noopStorage } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { Chain } from 'viem'
import { hoodi, hoodiChainId, hoodiRpcUrl } from './customNetworks'

const projectId = import.meta.env.VITE_PROJECT_ID

if (!projectId) {
  throw new Error('VITE_PROJECT_ID is not defined')
}

export const metadata = {
  name: 'DAO FE Lab',
  description: 'Minimal Hoodi wallet connector',
  url: 'https://dao.fe.local',
  icons: ['https://avatars.githubusercontent.com/u/179229932'],
}

export const supportedChains: [Chain, ...Chain[]] = [hoodi]

export const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: {
    [hoodiChainId]: http(hoodiRpcUrl),
  },
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId,
      showQrModal: true,
      metadata,
    }),
  ],
  multiInjectedProviderDiscovery: true,
  syncConnectedChain: true,
  ssr: true,
  storage: createStorage({
    storage: noopStorage,
  }),
})
