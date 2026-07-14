import { ContractFactory, Wallet, formatEther } from 'ethers'
import {
  artifact,
  assertCoston2,
  deployer,
  required,
  systemAddress,
  writeJson,
  writeText,
} from './common.mjs'

const signer = deployer()
const balance = await assertCoston2(signer)
if (balance === 0n) {
  throw new Error(`Deployer ${signer.address} has no C2FLR. Fund it at https://faucet.flare.network/coston2`)
}
console.log(`Deploying from ${signer.address} with ${formatEther(balance)} C2FLR`)

const [ftsoV2, fdcVerification] = await Promise.all([
  systemAddress('FtsoV2', signer),
  systemAddress('FdcVerification', signer),
])

async function deploy(file, name, args = []) {
  const { abi, bytecode } = artifact(file, name)
  const contract = await new ContractFactory(abi, bytecode, signer).deploy(...args)
  await contract.waitForDeployment()
  const receipt = await contract.deploymentTransaction().wait()
  console.log(`${name}: ${contract.target} (${receipt.hash})`)
  return contract
}

const teeSigner = new Wallet(required('TEE_SIGNER_PRIVATE_KEY')).address
const token = await deploy('contracts/CinderToken.sol', 'CinderUSD', [signer.address])
const oracle = await deploy('contracts/FlareAdapters.sol', 'FtsoXrpUsdAdapter', [ftsoV2, 120])
const fdc = await deploy('contracts/FlareAdapters.sol', 'FdcXrplPaymentAdapter', [fdcVerification])
const escrow = await deploy('contracts/CinderEscrow.sol', 'CinderEscrow', [oracle.target, fdc.target, teeSigner])

writeJson('deployments/coston2.local.json', {
  chainId: 114,
  deployer: signer.address,
  teeSigner,
  system: { ftsoV2, fdcVerification },
  contracts: {
    token: token.target,
    oracle: oracle.target,
    fdcAdapter: fdc.target,
    escrow: escrow.target,
  },
  deployedAt: new Date().toISOString(),
})
writeText('deployments/config.js', `window.CINDER_CONFIG = ${JSON.stringify({
  chainId: 114,
  rpcUrl: 'https://coston2-api.flare.network/ext/C/rpc',
  explorerUrl: 'https://coston2-explorer.flare.network',
  contracts: {
    token: token.target,
    oracle: oracle.target,
    fdcAdapter: fdc.target,
    escrow: escrow.target,
  },
}, null, 2)};\n`)
