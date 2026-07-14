import { AbiCoder, Contract, Wallet, keccak256, parseUnits, toUtf8Bytes } from 'ethers'
import { artifact, deployer, deployment, required, writeJson, writeText } from './common.mjs'

const state = deployment()
const buyer = deployer()
const tokenArtifact = artifact('contracts/CinderToken.sol', 'CinderUSD')
const escrowArtifact = artifact('contracts/CinderEscrow.sol', 'CinderEscrow')
const oracleArtifact = artifact('contracts/FlareAdapters.sol', 'FtsoXrpUsdAdapter')
const token = new Contract(state.contracts.token, tokenArtifact.abi, buyer)
const escrow = new Contract(state.contracts.escrow, escrowArtifact.abi, buyer)
const oracle = new Contract(state.contracts.oracle, oracleArtifact.abi, buyer)
const makerKeys = [1, 2, 3].map((index) => required(`C2_MAKER_${index}_PRIVATE_KEY`))
const makers = makerKeys.map((key) => new Wallet(key, buyer.provider))

for (const maker of makers) {
  const balance = await buyer.provider.getBalance(maker.address)
  if (balance < parseUnits('0.5', 18)) {
    await (await buyer.sendTransaction({ to: maker.address, value: parseUnits('1', 18) })).wait()
  }
}

const xrpAmountDrops = 10_000_000n
const escrowAmount = parseUnits('10', 6)
const [ftsoPriceE6] = await oracle.latestXrpUsd.staticCall()
const maxPriceE6 = (ftsoPriceE6 * 103n) / 100n
const destination = required('XRPL_BUYER_ADDRESS')
const destinationHash = keccak256(toUtf8Bytes(destination))
const termsCommitment = keccak256(toUtf8Bytes(`CINDER:XRP:${xrpAmountDrops}:${destination}`))
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600)

await (await token.approve(escrow.target, escrowAmount)).wait()
const nextId = await escrow.nextRfqId()
const createTx = await escrow.createRfq(
  token.target,
  escrowAmount,
  xrpAmountDrops,
  maxPriceE6,
  expiresAt,
  destinationHash,
  termsCommitment,
)
await createTx.wait()

const prices = [ftsoPriceE6 * 999n / 1000n, ftsoPriceE6 * 1002n / 1000n, ftsoPriceE6 * 1005n / 1000n]
const abi = AbiCoder.defaultAbiCoder()
const quotes = []
for (let index = 0; index < makers.length; index += 1) {
  const salt = keccak256(toUtf8Bytes(`cinder-quote-${Date.now()}-${index}`))
  const commitment = keccak256(abi.encode(
    ['uint256', 'address', 'uint256', 'bytes32'],
    [nextId, makers[index].address, prices[index], salt],
  ))
  const makerEscrow = escrow.connect(makers[index])
  const tx = await makerEscrow.submitQuoteCommitment(nextId, commitment)
  await tx.wait()
  quotes.push({ maker: makers[index].address, priceE6: prices[index].toString(), salt, commitment, txHash: tx.hash })
}

writeJson('deployments/rfq.local.json', {
  rfqId: nextId.toString(),
  createTxHash: createTx.hash,
  buyer: buyer.address,
  destination,
  destinationHash,
  xrpAmountDrops: xrpAmountDrops.toString(),
  escrowAmount: escrowAmount.toString(),
  ftsoPriceE6: ftsoPriceE6.toString(),
  maxPriceE6: maxPriceE6.toString(),
  expiresAt: expiresAt.toString(),
  quotes,
})
writeText('deployments/config.js', `window.CINDER_CONFIG = ${JSON.stringify({
  chainId: 114,
  rpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
  explorerUrl: 'https://coston2-explorer.flare.network',
  contracts: state.contracts,
  rfqId: nextId.toString(),
}, null, 2)};\n`)
console.log(`Created RFQ ${nextId} and committed ${quotes.length} real maker quotes.`)
