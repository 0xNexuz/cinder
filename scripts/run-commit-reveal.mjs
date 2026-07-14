import { AbiCoder, Contract, Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers'
import { artifact, deployer, deployment, required, writeJson, writeText } from './common.mjs'

const state = deployment()
const buyer = deployer()
const token = new Contract(state.contracts.token, artifact('contracts/CinderToken.sol', 'CinderUSD').abi, buyer)
const escrow = new Contract(state.contracts.escrow, artifact('contracts/CinderCommitRevealEscrow.sol', 'CinderCommitRevealEscrow').abi, buyer)
const oracle = new Contract(state.contracts.oracle, artifact('contracts/FlareAdapters.sol', 'FtsoXrpUsdAdapter').abi, buyer)
const makers = [1, 2, 3].map((i) => new Wallet(required(`C2_MAKER_${i}_PRIVATE_KEY`), buyer.provider))

for (const maker of makers) {
  if (await buyer.provider.getBalance(maker.address) < parseUnits('0.5', 18)) {
    await (await buyer.sendTransaction({ to: maker.address, value: parseUnits('1', 18) })).wait()
  }
}

const now = Math.floor(Date.now() / 1000)
const biddingEnds = now + 60
const revealEnds = now + 120
const expiresAt = now + 3600
const xrpAmountDrops = 10_000_000n
const escrowAmount = parseUnits('10', 6)
const [ftsoPriceE6] = await oracle.latestXrpUsd.staticCall()
const maxPriceE6 = ftsoPriceE6 * 103n / 100n
const destination = required('XRPL_BUYER_ADDRESS')
const destinationHash = keccak256(toUtf8Bytes(destination))
const termsCommitment = keccak256(toUtf8Bytes(`CINDER:COMMIT_REVEAL:XRP:${xrpAmountDrops}:${destination}`))

await (await token.approve(escrow.target, escrowAmount)).wait()
const rfqId = await escrow.nextRfqId()
const createTx = await escrow.createRfq(token.target, escrowAmount, xrpAmountDrops, maxPriceE6, biddingEnds, revealEnds, expiresAt, destinationHash, termsCommitment)
await createTx.wait()

const prices = [ftsoPriceE6 * 999n / 1000n, ftsoPriceE6 * 1002n / 1000n, ftsoPriceE6 * 1005n / 1000n]
const abi = AbiCoder.defaultAbiCoder()
const quotes = []
for (let i = 0; i < makers.length; i += 1) {
  const salt = keccak256(toUtf8Bytes(`cinder-v2-${Date.now()}-${i}`))
  const commitment = keccak256(abi.encode(['uint256','address','uint256','bytes32'], [rfqId, makers[i].address, prices[i], salt]))
  const tx = await escrow.connect(makers[i]).submitQuoteCommitment(rfqId, commitment)
  await tx.wait()
  quotes.push({ maker: makers[i].address, priceE6: prices[i].toString(), salt, commitment, txHash: tx.hash })
}

const waitUntil = async (timestamp) => {
  for (;;) {
    const block = await buyer.provider.getBlock('latest')
    if (block.timestamp >= timestamp) return
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
}
await waitUntil(biddingEnds)
for (let i = 0; i < makers.length; i += 1) {
  const tx = await escrow.connect(makers[i]).revealQuote(rfqId, quotes[i].priceE6, quotes[i].salt)
  await tx.wait()
  quotes[i].revealTxHash = tx.hash
}
await waitUntil(revealEnds)
const matchTx = await escrow.finalizeMatch(rfqId)
await matchTx.wait()
const result = await escrow.rfqs(rfqId)

writeJson('deployments/rfq.local.json', {
  rfqId: rfqId.toString(), createTxHash: createTx.hash, matchTxHash: matchTx.hash,
  buyer: buyer.address, destination, destinationHash, xrpAmountDrops: xrpAmountDrops.toString(),
  escrowAmount: escrowAmount.toString(), ftsoPriceE6: ftsoPriceE6.toString(), maxPriceE6: maxPriceE6.toString(),
  biddingEnds: String(biddingEnds), revealEnds: String(revealEnds), expiresAt: String(expiresAt),
  quotes, winner: result.winner, clearingPriceE6: result.clearingPriceE6.toString(), paymentReference: result.paymentReference,
  matcher: 'commit-reveal',
})
writeText('deployments/config.js', `window.CINDER_CONFIG = ${JSON.stringify({chainId:114,rpcUrl:'https://coston2-api.flare.network/ext/C/rpc',explorerUrl:'https://coston2-explorer.flare.network',contracts:state.contracts,rfqId:rfqId.toString(),matcher:'commit-reveal'}, null, 2)};\n`)
console.log(`RFQ ${rfqId} matched by commit-reveal: ${result.winner} at ${result.clearingPriceE6}`)
