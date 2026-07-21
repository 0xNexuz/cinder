import fs from 'node:fs'
import { Contract, ContractFactory } from 'ethers'
import { artifact, deployer, deployment, systemAddress, writeJson, writeText } from './common.mjs'

const DEFAULT_USDT0 = '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F'
const signer = deployer()
const state = deployment()
const usdt0 = process.env.COSTON2_USDT0_ADDRESS || DEFAULT_USDT0

const assetManagerAddress = await systemAddress('AssetManagerFXRP', signer)
const assetManager = new Contract(assetManagerAddress, ['function fAsset() view returns(address)'], signer)
const fxrp = await assetManager.fAsset()
const fdcVerification = await systemAddress('FdcVerification', signer)

async function deploy(file, name, args = []) {
  const compiled = artifact(file, name)
  const contract = await new ContractFactory(compiled.abi, compiled.bytecode, signer).deploy(...args)
  await contract.waitForDeployment()
  const receipt = await contract.deploymentTransaction().wait()
  console.log(`${name}=${contract.target} tx=${receipt.hash}`)
  return { contract, receipt }
}

const dualFdc = await deploy('contracts/FlareAdapters.sol', 'FdcXrplPaymentAdapter', [fdcVerification])
const bondVault = await deploy('contracts/CinderBondVault.sol', 'CinderBondVault', [fxrp])
const matcher = await deploy('contracts/CinderCommitRevealMatcherV2.sol', 'CinderCommitRevealMatcherV2')
const escrow = await deploy('contracts/CinderGuaranteedEscrow.sol', 'CinderGuaranteedEscrow', [
  usdt0,
  bondVault.contract.target,
  matcher.contract.target,
  state.contracts.oracle,
  dualFdc.contract.target,
  125,
  Number(process.env.CINDER_DELIVERY_WINDOW || 300),
])

await (await bondVault.contract.setController(escrow.contract.target)).wait()
await (await matcher.contract.setController(escrow.contract.target)).wait()

const contracts = {
  ...state.contracts,
  usdt0,
  fxrp,
  guaranteedEscrow: escrow.contract.target,
  bondVault: bondVault.contract.target,
  matcherV2: matcher.contract.target,
  dualFdcAdapter: dualFdc.contract.target,
}
const guaranteedDeployment = {
  usdt0,
  fxrp,
  fdcVerification,
  deliveryWindow: Number(process.env.CINDER_DELIVERY_WINDOW || 300),
  transactions: {
    dualFdcAdapter: dualFdc.receipt.hash,
    bondVault: bondVault.receipt.hash,
    matcherV2: matcher.receipt.hash,
    guaranteedEscrow: escrow.receipt.hash,
  },
}
writeJson('deployments/coston2.local.json', { ...state, contracts, guaranteedDeployment })

const configPath = 'deployments/config.js'
const source = fs.readFileSync(configPath, 'utf8')
const match = source.match(/window\.CINDER_CONFIG\s*=\s*([\s\S]*);\s*$/)
const publicConfig = match ? JSON.parse(match[1]) : { chainId: 114 }
publicConfig.contracts = contracts
publicConfig.guaranteed = {
  stableAsset: 'USDT0',
  bondAsset: 'FXRP',
  matcher: 'commit-reveal-v2',
  deliveryWindow: guaranteedDeployment.deliveryWindow,
}
writeText(configPath, `window.CINDER_CONFIG = ${JSON.stringify(publicConfig, null, 2)};\n`)

console.log('Guaranteed RFQ deployment complete and controllers bound.')
