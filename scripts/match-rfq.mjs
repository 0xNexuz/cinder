import fs from 'node:fs'
import { Contract, Wallet, solidityPackedKeccak256 } from 'ethers'
import { artifact, deployer, deployment, required, root, writeJson } from './common.mjs'

const deploymentState = deployment()
const rfqPath = `${root}/deployments/rfq.local.json`
const rfq = JSON.parse(fs.readFileSync(rfqPath, 'utf8'))
const winner = [...rfq.quotes].sort((a, b) => BigInt(a.priceE6) < BigInt(b.priceE6) ? -1 : 1)[0]
const paymentReference = solidityPackedKeccak256(
  ['string', 'uint256', 'address'],
  ['CINDER_RFQ', BigInt(rfq.rfqId), winner.maker],
)
const digest = solidityPackedKeccak256(
  ['address', 'uint256', 'uint256', 'address', 'uint256', 'bytes32'],
  [deploymentState.contracts.escrow, 114, BigInt(rfq.rfqId), winner.maker, BigInt(winner.priceE6), paymentReference],
)
const tee = new Wallet(required('TEE_SIGNER_PRIVATE_KEY'))
const signature = tee.signingKey.sign(digest).serialized
const escrowArtifact = artifact('contracts/CinderEscrow.sol', 'CinderEscrow')
const escrow = new Contract(deploymentState.contracts.escrow, escrowArtifact.abi, deployer())
const tx = await escrow.finalizeMatch(rfq.rfqId, winner.maker, winner.priceE6, paymentReference, signature)
await tx.wait()

writeJson('deployments/rfq.local.json', {
  ...rfq,
  winner: winner.maker,
  clearingPriceE6: winner.priceE6,
  paymentReference,
  matchTxHash: tx.hash,
})
console.log(`Matched RFQ ${rfq.rfqId}; payment reference ${paymentReference}`)
