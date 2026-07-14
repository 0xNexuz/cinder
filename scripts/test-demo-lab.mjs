import { AbiCoder, Contract, Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers'
import { artifact, deployment, provider, required } from './common.mjs'

const state = deployment()
const signer = new Wallet(required('C2_MAKER_3_PRIVATE_KEY'), provider())
const token = new Contract(state.contracts.demoToken, artifact('contracts/CinderDemoToken.sol', 'CinderDemoUSD').abi, signer)
const escrow = new Contract(state.contracts.escrow, artifact('contracts/CinderCommitRevealEscrow.sol', 'CinderCommitRevealEscrow').abi, signer)
const oracle = new Contract(state.contracts.oracle, artifact('contracts/FlareAdapters.sol', 'FtsoXrpUsdAdapter').abi, signer)

if (!(await token.hasClaimed(signer.address))) {
  const tx = await token.claim(); await tx.wait(); console.log(`claim=${tx.hash}`)
}
const amount = parseUnits('5', 6)
let tx = await token.approve(escrow.target, amount); await tx.wait(); console.log(`approve=${tx.hash}`)
const block = await signer.provider.getBlock('latest')
const biddingEnds = block.timestamp + 35
const revealEnds = biddingEnds + 35
const expiresAt = revealEnds + 1800
const [ftso] = await oracle.latestXrpUsd.staticCall()
const rfqId = await escrow.nextRfqId()
tx = await escrow.createRfq(token.target, amount, 5_000_000n, ftso * 103n / 100n, biddingEnds, revealEnds, expiresAt, keccak256(toUtf8Bytes(required('XRPL_BUYER_ADDRESS'))), keccak256(toUtf8Bytes('CINDER_BROWSER_LAB_SMOKE')))
await tx.wait(); console.log(`create=${tx.hash}`)
const price = ftso * 999n / 1000n
const salt = keccak256(toUtf8Bytes(`lab-smoke-${Date.now()}`))
const commitment = keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','address','uint256','bytes32'], [rfqId, signer.address, price, salt]))
tx = await escrow.submitQuoteCommitment(rfqId, commitment); await tx.wait(); console.log(`commit=${tx.hash}`)
async function waitFor(timestamp) { for (;;) { const b = await signer.provider.getBlock('latest'); if (b.timestamp >= timestamp) return; await new Promise(r => setTimeout(r, 5000)) } }
await waitFor(biddingEnds)
tx = await escrow.revealQuote(rfqId, price, salt); await tx.wait(); console.log(`reveal=${tx.hash}`)
await waitFor(revealEnds + 5)
tx = await escrow.finalizeMatch(rfqId); await tx.wait(); console.log(`finalize=${tx.hash}`)
console.log(`Demo Lab RFQ ${rfqId} completed through real on-chain matching.`)
