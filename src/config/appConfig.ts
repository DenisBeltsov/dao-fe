import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient()

// Настройки теми залишаються для можливого підключення AppKit у наступних тасках.
export const generalConfig = {
  themeMode: 'light' as const,
  themeVariables: {
    '--w3m-accent': '#000000',
  },
}
