import fs from 'node:fs'
import { setDefaultResultOrder } from 'node:dns'
import { Contract, formatUnits } from 'ethers'
import { Client } from 'xrpl'
import { artifact, deployment, provider, root } from './common.mjs'

setDefaultResultOrder('ipv4first')
const deploymentState = deployment()
const rfq = JSON.parse(fs.readFileSync(`${root}/deployments/rfq.local.json`, 'utf8'))
const chain = provider()
const escrow = new Contract(
  deploymentState.contracts.escrow,
  (deploymentState.matcher === 'commit-reveal'
    ? artifact('contracts/CinderCommitRevealEscrow.sol', 'CinderCommitRevealEscrow')
    : artifact('contracts/CinderEscrow.sol', 'CinderEscrow')).abi,
  chain,
)
const token = new Contract(
  deploymentState.contracts.token,
  artifact('contracts/CinderToken.sol', 'CinderUSD').abi,
  chain,
)

const [onchain, winnerBalance, settlementReceipt] = await Promise.all([
  escrow.rfqs(rfq.rfqId),
  token.balanceOf(rfq.winner),
  chain.getTransactionReceipt(rfq.settlementTxHash),
])
if (Number(onchain.status) !== 2) throw new Error(`RFQ status is ${onchain.status}, expected Settled (2)`)
if (winnerBalance < BigInt(rfq.escrowAmount)) throw new Error('Winning maker did not receive the escrowed token balance')
if (!settlementReceipt || settlementReceipt.status !== 1) throw new Error('Settlement transaction is not successful')

const xrpl = new Client(
  process.env.XRPL_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233',
  { connectionTimeout: 30_000, timeout: 30_000 },
)
await xrpl.connect()
let xrplResult
try {
  xrplResult = await xrpl.request({ command: 'tx', transaction: rfq.xrplTxHash, binary: false })
} finally {
  await xrpl.disconnect()
}
if (!xrplResult.result.validated) throw new Error('XRPL payment is not validated')
if (xrplResult.result.meta?.TransactionResult !== 'tesSUCCESS') throw new Error('XRPL payment did not succeed')

console.log(`RFQ ${rfq.rfqId}: Settled on Coston2`)
console.log(`Escrow released: ${formatUnits(rfq.escrowAmount, 6)} cUSD`)
console.log(`Winner balance: ${formatUnits(winnerBalance, 6)} cUSD`)
console.log(`XRPL transaction: validated / tesSUCCESS`)
console.log(`Settlement block: ${settlementReceipt.blockNumber}`)
