
// 0. Додаємо projectId

// 1. додаємо помилку якщо !projectId

// 2. metadata - щоб гаманцю було зрозуміло, хто ти та що саме просиш.
// metadata в AppKit/Web3Modal — це паспорт твого dApp, який летить у гаманець під час конекту
// через WalletConnect/адаптери.
export const metadata = {
  name: 'AppKit',
  description: 'Example',
  url: 'https://reown.com', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/179229932']
}

// 3. Прописуємо Networks які будемо використовувати


// 4. Створити WagmiAdapter і передати в нього projectId та networks
