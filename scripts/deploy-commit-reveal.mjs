import { ContractFactory } from 'ethers'
import { artifact, deployer, deployment, writeJson, writeText } from './common.mjs'

const signer = deployer()
const state = deployment()
const compiled = artifact('contracts/CinderCommitRevealEscrow.sol', 'CinderCommitRevealEscrow')
const contract = await new ContractFactory(compiled.abi, compiled.bytecode, signer).deploy(
  state.contracts.oracle,
  state.contracts.fdcAdapter,
  125,
)
await contract.waitForDeployment()
const receipt = await contract.deploymentTransaction().wait()
const contracts = {
  ...state.contracts,
  legacyEscrow: state.contracts.escrow,
  escrow: contract.target,
}
writeJson('deployments/coston2.local.json', {
  ...state,
  contracts,
  matcher: 'commit-reveal',
  matcherDeploymentTx: receipt.hash,
})
writeText('deployments/config.js', `window.CINDER_CONFIG = ${JSON.stringify({
  chainId: 114,
  rpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
  explorerUrl: 'https://coston2-explorer.flare.network',
  contracts,
  matcher: 'commit-reveal',
  verifiedLegacyRfq: {
    escrow: state.contracts.escrow,
    rfqId: '2',
    settlement: '0x347ee40261c001f0f9cb81cc879281bdc31fae3c511621bc9b1a54ccc98bcd3e',
    xrpl: 'B35480802057EB0D77C6CAB3A87FF734813130DCDCB4A480ED53B0C458C5D663',
  },
}, null, 2)};\n`)
console.log(`Commit-reveal escrow: ${contract.target} (${receipt.hash})`)
