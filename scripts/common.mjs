import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Contract, JsonRpcProvider, Wallet } from 'ethers'

export const root = process.cwd()
export const COSTON2_CHAIN_ID = 114n
export const REGISTRY_ADDRESS = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019'
export const REGISTRY_ABI = [
  'function getContractAddressByName(string name) view returns (address)',
]

export function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in .env`)
  return value
}

export function provider() {
  return new JsonRpcProvider(
    process.env.COSTON2_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc',
    Number(COSTON2_CHAIN_ID),
  )
}

export function deployer() {
  return new Wallet(required('COSTON2_PRIVATE_KEY'), provider())
}

export function artifact(file, contractName) {
  const compiled = JSON.parse(
    fs.readFileSync(path.join(root, 'artifacts', 'contracts.json'), 'utf8'),
  )
  const item = compiled[file]?.[contractName]
  if (!item) throw new Error(`Missing artifact ${file}:${contractName}; run npm run contracts:check`)
  return { abi: item.abi, bytecode: `0x${item.evm.bytecode.object}` }
}

export function deployment() {
  const file = path.join(root, 'deployments', 'coston2.local.json')
  if (!fs.existsSync(file)) throw new Error('Missing Coston2 deployment; run npm run deploy:coston2')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function writeJson(relativePath, value) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`)
}

export function writeText(relativePath, value) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, value)
}

export async function systemAddress(name, signerOrProvider = provider()) {
  const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signerOrProvider)
  const address = await registry.getContractAddressByName(name)
  if (/^0x0{40}$/i.test(address)) throw new Error(`${name} is not registered on Coston2`)
  return address
}

export async function assertCoston2(signer = deployer()) {
  const network = await signer.provider.getNetwork()
  if (network.chainId !== COSTON2_CHAIN_ID) throw new Error(`Wrong chain ${network.chainId}`)
  return signer.provider.getBalance(signer.address)
}
