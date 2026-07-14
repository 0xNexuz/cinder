import fs from 'node:fs'

const requiredFiles = [
  'index.html',
  'README.md',
  'contracts/CinderEscrow.sol',
  'contracts/mocks/MockAdapters.sol',
]

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`)
  }
}

const html = fs.readFileSync('index.html', 'utf8')
const contract = fs.readFileSync('contracts/CinderEscrow.sol', 'utf8')

const requiredHtml = [
  'Cinder RFQ',
  'Private price discovery. Public settlement.',
  'https://coston2-api.flare.network/ext/C/rpc',
  'wallet_switchEthereumChain',
  'FDC verifies',
]

const requiredContract = [
  'interface IPriceOracleAdapter',
  'interface IFdcSettlementAdapter',
  'function createRfq',
  'function submitQuoteCommitment',
  'function finalizeMatch',
  'function settleWithFdc',
  'function refundExpired',
]

for (const text of requiredHtml) {
  if (!html.includes(text)) {
    throw new Error(`index.html is missing: ${text}`)
  }
}

for (const text of requiredContract) {
  if (!contract.includes(text)) {
    throw new Error(`CinderEscrow.sol is missing: ${text}`)
  }
}

console.log('Cinder RFQ static demo and contract surfaces are present.')
