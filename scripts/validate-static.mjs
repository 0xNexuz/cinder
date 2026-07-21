import fs from 'node:fs'

const requiredFiles = [
  'index.html',
  'docs.html',
  'README.md',
  'contracts/CinderGuaranteedEscrow.sol',
  'contracts/CinderCommitRevealMatcherV2.sol',
  'contracts/CinderBondVault.sol',
  'contracts/FlareAdapters.sol',
]

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`)
}

const html = fs.readFileSync('index.html', 'utf8')
const docs = fs.readFileSync('docs.html', 'utf8')
const readme = fs.readFileSync('README.md', 'utf8')
const escrow = fs.readFileSync('contracts/CinderGuaranteedEscrow.sol', 'utf8')
const adapter = fs.readFileSync('contracts/FlareAdapters.sol', 'utf8')

for (const text of ['Delivery wins.', 'USDT0', 'FXRP', 'Payment missed', 'Verify receipts live', 'wallet_switchEthereumChain']) {
  if (!html.includes(text)) throw new Error(`index.html is missing: ${text}`)
}
for (const text of ['Cinder / Documentation', 'Real success path: RFQ #3', 'Real default path: RFQ #1', 'Evidence of new work']) {
  if (!docs.includes(text)) throw new Error(`docs.html is missing: ${text}`)
}
for (const text of ['Cinder Guaranteed RFQ', 'ReferencedPaymentNonexistence', '0x5e81491036c49cdc4ff8760d1eeba4d3c66141bc49343028cd016de34ccf0837']) {
  if (!readme.includes(text)) throw new Error(`README.md is missing: ${text}`)
}
for (const text of ['function settleWithPaymentProof', 'function resolveNonPayment', 'function claimLosingBond']) {
  if (!escrow.includes(text)) throw new Error(`CinderGuaranteedEscrow.sol is missing: ${text}`)
}
if (!adapter.includes('verifyReferencedPaymentNonexistence')) throw new Error('FlareAdapters.sol is missing non-payment verification')

console.log('Cinder guaranteed RFQ contracts, proof console and documentation are present.')
