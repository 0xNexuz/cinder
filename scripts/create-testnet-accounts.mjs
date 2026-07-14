import fs from 'node:fs'
import { Wallet as EvmWallet } from 'ethers'
import { Wallet as XrplWallet } from 'xrpl'

const envPath = '.env'
if (fs.existsSync(envPath)) {
  throw new Error('.env already exists; refusing to overwrite testnet credentials')
}

const deployer = EvmWallet.createRandom()
const teeSigner = EvmWallet.createRandom()
const makers = [EvmWallet.createRandom(), EvmWallet.createRandom(), EvmWallet.createRandom()]
const xrplBuyer = XrplWallet.generate()
const xrplMaker = XrplWallet.generate()

const content = [
  'COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc',
  `COSTON2_PRIVATE_KEY=${deployer.privateKey}`,
  `TEE_SIGNER_PRIVATE_KEY=${teeSigner.privateKey}`,
  ...makers.map((wallet, index) => `C2_MAKER_${index + 1}_PRIVATE_KEY=${wallet.privateKey}`),
  'XRPL_TESTNET_URL=wss://s.altnet.rippletest.net:51233',
  `XRPL_BUYER_SEED=${xrplBuyer.seed}`,
  `XRPL_BUYER_ADDRESS=${xrplBuyer.address}`,
  `XRPL_MAKER_SEED=${xrplMaker.seed}`,
  `XRPL_MAKER_ADDRESS=${xrplMaker.address}`,
  'VERIFIER_API_KEY_TESTNET=00000000-0000-0000-0000-000000000000',
  'COSTON2_DA_LAYER_URL=https://ctn2-data-availability.flare.network/',
  '',
].join('\n')

fs.writeFileSync(envPath, content, { mode: 0o600 })
console.log('Created isolated testnet accounts. Secrets are stored only in .env.')
console.log(`Coston2 deployer to fund: ${deployer.address}`)
console.log(`XRPL buyer: ${xrplBuyer.address}`)
console.log(`XRPL maker: ${xrplMaker.address}`)
