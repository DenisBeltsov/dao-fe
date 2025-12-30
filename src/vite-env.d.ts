/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROJECT_ID: string
  readonly VITE_ALCHEMY_KEY: string
  readonly VITE_API_URL: string
  readonly VITE_DAO_ADDRESS: string
  readonly VITE_CUSTOM_TOKEN_ADDRESS?: string
  readonly VITE_TOKEN_DECIMALS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
