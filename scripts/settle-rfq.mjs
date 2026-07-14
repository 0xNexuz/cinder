import fs from 'node:fs'
import { Contract } from 'ethers'
import { artifact, deployer, deployment, root, writeJson, writeText } from './common.mjs'

const deploymentState = deployment()
const rfqPath = `${root}/deployments/rfq.local.json`
const rfq = JSON.parse(fs.readFileSync(rfqPath, 'utf8'))
if (!rfq.fdcProof) throw new Error('Missing FDC proof; run npm run flow:fdc')

const escrowArtifact = deploymentState.matcher === 'commit-reveal'
  ? artifact('contracts/CinderCommitRevealEscrow.sol', 'CinderCommitRevealEscrow')
  : artifact('contracts/CinderEscrow.sol', 'CinderEscrow')
const escrow = new Contract(deploymentState.contracts.escrow, escrowArtifact.abi, deployer())
await escrow.settleWithFdc.staticCall(rfq.rfqId, rfq.fdcProof)
const tx = await escrow.settleWithFdc(rfq.rfqId, rfq.fdcProof)
const receipt = await tx.wait()

writeJson('deployments/rfq.local.json', {
  ...rfq,
  settlementTxHash: tx.hash,
  settlementBlock: receipt.blockNumber,
})
writeText('deployments/config.js', `window.CINDER_CONFIG = ${JSON.stringify({
  chainId: 114,
  rpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
  explorerUrl: 'https://coston2-explorer.flare.network',
  xrplExplorerUrl: 'https://testnet.xrpl.org/transactions',
  contracts: deploymentState.contracts,
  rfqId: rfq.rfqId,
  matcher: deploymentState.matcher,
  transactions: {
    create: rfq.createTxHash,
    match: rfq.matchTxHash,
    xrpl: rfq.xrplTxHash,
    fdcRequest: rfq.fdcRequestTxHash,
    settlement: tx.hash,
  },
}, null, 2)};\n`)
console.log(`RFQ ${rfq.rfqId} settled on Coston2: ${tx.hash}`)
