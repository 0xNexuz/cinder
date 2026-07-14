export type StageKey = 'draft' | 'quoted' | 'matched' | 'paid' | 'settled'

export type MarketMaker = {
  name: string
  desk: string
  spreadBps: number
  quoteUsd: number
  encryptedQuote: string
  selected: boolean
}

export type AuditEvent = {
  label: string
  detail: string
  status: 'done' | 'active' | 'pending'
}

export const stages: { key: StageKey; label: string }[] = [
  { key: 'draft', label: 'RFQ' },
  { key: 'quoted', label: 'Private quotes' },
  { key: 'matched', label: 'TEE match' },
  { key: 'paid', label: 'XRPL payment' },
  { key: 'settled', label: 'FDC release' },
]

export const makers: MarketMaker[] = [
  {
    name: 'Northstar OTC',
    desk: 'XRP liquidity desk',
    spreadBps: 12,
    quoteUsd: 0.6241,
    encryptedQuote: '0x9f13...7c40',
    selected: true,
  },
  {
    name: 'Redwood Relay',
    desk: 'Institutional market maker',
    spreadBps: 18,
    quoteUsd: 0.6278,
    encryptedQuote: '0xb04a...2a9e',
    selected: false,
  },
  {
    name: 'Delta Nest',
    desk: 'Cross-chain desk',
    spreadBps: 21,
    quoteUsd: 0.6295,
    encryptedQuote: '0x7bd2...8101',
    selected: false,
  },
]

export const stageCopy: Record<StageKey, string> = {
  draft: 'Buyer escrows USDT0 on Coston2 and commits to XRP amount, XRPL destination, expiry, and max slippage.',
  quoted: 'Makers submit ciphertext quotes and commitments. The buyer and competitors cannot see raw pricing.',
  matched: 'A Confidential Compute extension decrypts quotes inside a TEE and signs the winning quote.',
  paid: 'The winning maker sends XRP on XRPL testnet using the payment reference embedded in the RFQ.',
  settled: 'FDC verifies the XRPL payment and the escrow releases USDT0 to the winning maker.',
}

export function getAuditTrail(stage: StageKey): AuditEvent[] {
  const order = stages.map((item) => item.key)
  const current = order.indexOf(stage)

  return [
    {
      label: 'Escrow created',
      detail: '1,000.00 USDT0 locked on Coston2',
      status: current >= 0 ? 'done' : 'pending',
    },
    {
      label: 'Quote commitments',
      detail: '3 encrypted offers registered with maker bonds',
      status: current >= 1 ? 'done' : current === 0 ? 'active' : 'pending',
    },
    {
      label: 'TEE signed match',
      detail: 'Best quote selected at 12 bps spread',
      status: current >= 2 ? 'done' : current === 1 ? 'active' : 'pending',
    },
    {
      label: 'XRPL settlement',
      detail: 'Native XRP payment reference: RFQ-7Q2C',
      status: current >= 3 ? 'done' : current === 2 ? 'active' : 'pending',
    },
    {
      label: 'FDC attestation',
      detail: 'Payment proof releases escrow, replay protected',
      status: current >= 4 ? 'done' : current === 3 ? 'active' : 'pending',
    },
  ]
}

export function nextStage(stage: StageKey): StageKey {
  const order = stages.map((item) => item.key)
  const next = Math.min(order.indexOf(stage) + 1, order.length - 1)
  return order[next]
}
