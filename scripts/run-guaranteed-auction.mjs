import { Client } from 'xrpl'
import { Contract, Wallet, formatUnits, keccak256, parseUnits, toUtf8Bytes } from 'ethers'
import { artifact, deployer, deployment, required, writeJson } from './common.mjs'

const state = deployment()
for (const name of ['usdt0', 'fxrp', 'guaranteedEscrow', 'bondVault', 'matcherV2']) {
  if (!state.contracts[name]) throw new Error(`Missing ${name}; run npm run deploy:guaranteed`)
}

const buyer = deployer()
const makers = [
  new Wallet(required('C2_MAKER_2_PRIVATE_KEY'), buyer.provider),
  new Wallet(required('C2_MAKER_3_PRIVATE_KEY'), buyer.provider),
]
const erc20Abi = [
  'function balanceOf(address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)',
  'function transfer(address,uint256) returns(bool)',
]
const usdt0 = new Contract(state.contracts.usdt0, erc20Abi, buyer)
const fxrp = new Contract(state.contracts.fxrp, erc20Abi, buyer)
const escrow = new Contract(state.contracts.guaranteedEscrow, artifact('contracts/CinderGuaranteedEscrow.sol', 'CinderGuaranteedEscrow').abi, buyer)
const matcher = new Contract(state.contracts.matcherV2, artifact('contracts/CinderCommitRevealMatcherV2.sol', 'CinderCommitRevealMatcherV2').abi, buyer)
const oracle = new Contract(state.contracts.oracle, artifact('contracts/FlareAdapters.sol', 'FtsoXrpUsdAdapter').abi, buyer)

const escrowAmount = parseUnits(process.env.CINDER_DEMO_USDT0 || '2', 6)
const bondAmount = parseUnits(process.env.CINDER_DEMO_FXRP_BOND || '1', 6)
const xrpAmountDrops = parseUnits(process.env.CINDER_DEMO_XRP || '2', 6)

if (await usdt0.balanceOf(buyer.address) < escrowAmount) {
  throw new Error(`Buyer needs ${formatUnits(escrowAmount, 6)} faucet USDT0`)
}
for (const maker of makers) {
  const gasFloor = parseUnits(process.env.CINDER_MAKER_GAS_FLOOR || '1', 18)
  const gasBalance = await buyer.provider.getBalance(maker.address)
  if (gasBalance < gasFloor) {
    await (await buyer.sendTransaction({ to: maker.address, value: gasFloor - gasBalance })).wait()
  }
  const balance = await fxrp.balanceOf(maker.address)
  if (balance < bondAmount) {
    await (await fxrp.transfer(maker.address, bondAmount - balance)).wait()
  }
  await (await fxrp.connect(maker).approve(state.contracts.bondVault, bondAmount)).wait()
}

const block = await buyer.provider.getBlock('latest')
const biddingEnds = Number(block.timestamp) + Number(process.env.CINDER_BIDDING_SECONDS || 45)
const revealEnds = biddingEnds + Number(process.env.CINDER_REVEAL_SECONDS || 45)
const matchExpiresAt = revealEnds + 300
const [ftsoPriceE6] = await oracle.latestXrpUsd.staticCall()
const maxPriceE6 = ftsoPriceE6 * 103n / 100n
const destination = required('XRPL_BUYER_ADDRESS')
const destinationHash = keccak256(toUtf8Bytes(destination))
const termsCommitment = keccak256(toUtf8Bytes(`CINDER_GUARANTEED:USDT0:XRP:${xrpAmountDrops}:${bondAmount}:${destination}`))

await (await usdt0.approve(escrow.target, escrowAmount)).wait()
const rfqId = await escrow.nextRfqId()
const createTx = await escrow.createRfq(
  escrowAmount,
  xrpAmountDrops,
  maxPriceE6,
  bondAmount,
  biddingEnds,
  revealEnds,
  matchExpiresAt,
  destinationHash,
  termsCommitment,
)
await createTx.wait()
console.log(`create=${createTx.hash}`)

const progress = {
  rfqId: rfqId.toString(),
  buyer: buyer.address,
  destination,
  destinationHash,
  escrowAmount: escrowAmount.toString(),
  xrpAmountDrops: xrpAmountDrops.toString(),
  bondAmount: bondAmount.toString(),
  ftsoPriceE6: ftsoPriceE6.toString(),
  maxPriceE6: maxPriceE6.toString(),
  biddingEnds,
  revealEnds,
  matchExpiresAt,
  quotes: [],
  createTxHash: createTx.hash,
  outcome: 'auction-open',
}
writeJson('deployments/guaranteed-rfq.local.json', progress)

const prices = [ftsoPriceE6 * 999n / 1000n, ftsoPriceE6 * 1004n / 1000n]
const quotes = []
for (let i = 0; i < makers.length; i += 1) {
  const salt = keccak256(toUtf8Bytes(`cinder-guaranteed-${rfqId}-${Date.now()}-${i}`))
  const commitment = await matcher.quoteCommitment(rfqId, makers[i].address, prices[i], salt)
  const tx = await matcher.connect(makers[i]).submitCommitment(rfqId, commitment)
  await tx.wait()
  quotes.push({ maker: makers[i].address, priceE6: prices[i].toString(), salt, commitment, commitTxHash: tx.hash })
  console.log(`maker${i + 1}.commit=${tx.hash}`)
  progress.quotes = quotes
  writeJson('deployments/guaranteed-rfq.local.json', progress)
}

async function waitFor(timestamp, label) {
  for (;;) {
    const latest = await buyer.provider.getBlock('latest')
    if (Number(latest.timestamp) >= timestamp) return
    console.log(`${label}: ${timestamp - Number(latest.timestamp)}s`)
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
}

await waitFor(biddingEnds, 'reveal opens')
for (let i = 0; i < makers.length; i += 1) {
  const tx = await matcher.connect(makers[i]).revealQuote(rfqId, prices[i], quotes[i].salt)
  await tx.wait()
  quotes[i].revealTxHash = tx.hash
  console.log(`maker${i + 1}.reveal=${tx.hash}`)
}
await waitFor(revealEnds, 'finalize opens')
const finalizeTx = await escrow.finalizeMatch(rfqId)
await finalizeTx.wait()
const result = await escrow.rfqs(rfqId)

const xrpl = new Client(process.env.XRPL_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233')
await xrpl.connect()
let matchLedgerIndex
try {
  const ledger = await xrpl.request({ command: 'ledger', ledger_index: 'validated' })
  matchLedgerIndex = Number(ledger.result.ledger_index)
} finally {
  await xrpl.disconnect()
}

writeJson('deployments/guaranteed-rfq.local.json', {
  rfqId: rfqId.toString(),
  buyer: buyer.address,
  destination,
  destinationHash,
  escrowAmount: escrowAmount.toString(),
  xrpAmountDrops: xrpAmountDrops.toString(),
  bondAmount: bondAmount.toString(),
  ftsoPriceE6: ftsoPriceE6.toString(),
  maxPriceE6: maxPriceE6.toString(),
  biddingEnds,
  revealEnds,
  matchExpiresAt,
  matchedAt: Number(result.matchedAt),
  deliveryDeadline: Number(result.deliveryDeadline),
  matchLedgerIndex,
  quotes,
  winner: result.winner,
  clearingPriceE6: result.clearingPriceE6.toString(),
  paymentReference: result.paymentReference,
  createTxHash: createTx.hash,
  finalizeTxHash: finalizeTx.hash,
  outcome: 'awaiting-xrpl-payment',
})
console.log(`finalize=${finalizeTx.hash}`)
console.log(`RFQ ${rfqId} winner=${result.winner} deliveryDeadline=${result.deliveryDeadline}`)
