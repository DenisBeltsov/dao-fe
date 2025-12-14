// 0. Додати queryClient

// 2. Додати generalConfig який буде використаний у createAppKit.
// Ці налаштування будуть застосовані глобально до AppKit.
export const generalConfig = {
  // ...
  themeMode: 'light' as const,
  themeVariables: {
	'--w3m-accent': '#000000',
  }
}
