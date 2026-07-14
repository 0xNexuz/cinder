import { createPublicClient, defineChain, http } from 'viem'

export const coston2 = defineChain({
  id: 114,
  name: 'Coston2',
  nativeCurrency: {
    decimals: 18,
    name: 'Coston2 Flare',
    symbol: 'C2FLR',
  },
  rpcUrls: {
    default: {
      http: ['https://coston2-api.flare.network/ext/C/rpc'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Coston2 Explorer',
      url: 'https://coston2-explorer.flare.network',
    },
  },
})

export const publicClient = createPublicClient({
  chain: coston2,
  transport: http(),
})

export type NetworkSnapshot = {
  blockNumber: bigint
  latencyMs: number
  checkedAt: string
}

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const startedAt = performance.now()
  const blockNumber = await publicClient.getBlockNumber()
  return {
    blockNumber,
    latencyMs: Math.round(performance.now() - startedAt),
    checkedAt: new Date().toISOString(),
  }
}

export async function switchToCoston2(provider: unknown) {
  const ethereum = provider as {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  }

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x72' }],
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
    if (code !== 4902) {
      throw error
    }

    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0x72',
          chainName: 'Coston2',
          nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
          rpcUrls: ['https://coston2-api.flare.network/ext/C/rpc'],
          blockExplorerUrls: ['https://coston2-explorer.flare.network'],
        },
      ],
    })
  }
}
