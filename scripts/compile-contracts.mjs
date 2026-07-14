import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'

const root = process.cwd()
const contractFiles = [
  'contracts/CinderEscrow.sol',
  'contracts/CinderCommitRevealEscrow.sol',
  'contracts/FlareAdapters.sol',
  'contracts/CinderToken.sol',
  'contracts/CinderDemoToken.sol',
  'contracts/mocks/MockAdapters.sol',
]

const sources = Object.fromEntries(
  contractFiles.map((file) => [
    file,
    {
      content: fs.readFileSync(path.join(root, file), 'utf8'),
    },
  ]),
)

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = output.errors?.filter((item) => item.severity === 'error') ?? []

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error.formattedMessage)
  }
  process.exit(1)
}

fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true })
fs.writeFileSync(path.join(root, 'artifacts', 'contracts.json'), JSON.stringify(output.contracts, null, 2))

const names = Object.values(output.contracts).flatMap((contracts) => Object.keys(contracts))
console.log(`Compiled ${names.length} contracts: ${names.join(', ')}`)
