import { ContractFactory } from 'ethers'
import { artifact, deployer, deployment, writeJson } from './common.mjs'

const signer = deployer()
const state = deployment()
const compiled = artifact('contracts/CinderDemoToken.sol', 'CinderDemoUSD')
const token = await new ContractFactory(compiled.abi, compiled.bytecode, signer).deploy()
await token.waitForDeployment()
const receipt = await token.deploymentTransaction().wait()
writeJson('deployments/coston2.local.json', {
  ...state,
  contracts: { ...state.contracts, legacyToken: state.contracts.token, demoToken: token.target },
  demoTokenDeploymentTx: receipt.hash,
})
console.log(`CinderDemoUSD: ${token.target} (${receipt.hash})`)
