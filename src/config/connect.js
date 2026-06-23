import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { sepolia } from '@reown/appkit/networks'

export const projectId = import.meta.env ? import.meta.env.VITE_REOWN_PROJECT_ID : '';

if (!projectId) {
  throw new Error('VITE_REOWN_PROJECT_ID is missing from your environment variables.')
}
// 2. Set up the metadata for your dApp
const metadata = {
  name: 'Zeroremit',
  description: 'Confidential Invoice Payment Application',
  url: 'https://yoursite.com',
  icons: ['https://avatars.githubusercontent.com/u/17922993']
}

// 3. Define the network array (Restricting to Sepolia only)
const networks = [sepolia]

// 4. Create the Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
})

// 5. Create and export the AppKit instance
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: false
  },
  defaultNetwork: sepolia 
})