import fs from 'node:fs'
import { setDefaultResultOrder } from 'node:dns'
import { AbiCoder, Contract, encodeBytes32String, ZeroHash } from 'ethers'
import { Client } from 'xrpl'
import { artifact, deployer, deployment, root, systemAddress, writeJson, writeText } from './common.mjs'

setDefaultResultOrder('ipv4first')
const mode = process.argv[2] || 'payment'
if (!['payment', 'non-payment'].includes(mode)) throw new Error('Use payment or non-payment')
const stateFile = `${root}/deployments/guaranteed-rfq.local.json`
const rfq = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
const deploymentState = deployment()
const signer = deployer()
const apiKey = process.env.VERIFIER_API_KEY_TESTNET || '00000000-0000-0000-0000-000000000000'

async function retry(operation, attempts = 8) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation() } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 2_000 * (attempt + 1))))
    }
  }
  throw lastError
}

async function xrplLedgerAtOrBefore(targetTimestamp) {
  const client = new Client(
    process.env.XRPL_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233',
    { connectionTimeout: 30_000, timeout: 30_000 },
  )
  await client.connect()
  try {
    const current = await client.request({ command: 'ledger', ledger_index: 'validated' })
    let low = Math.max(1, Number(current.result.ledger_index) - 5_000)
    let high = Number(current.result.ledger_index)
    let boundary = low
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const ledger = await client.request({ command: 'ledger', ledger_index: middle })
      const timestamp = Number(ledger.result.ledger.close_time) + 946_684_800
      if (timestamp <= Number(targetTimestamp)) {
        boundary = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    return boundary
  } finally {
    await client.disconnect()
  }
}

let verifierPath
let request
let responseType
if (mode === 'payment') {
  if (!rfq.xrplTxHash) throw new Error('Run npm run guaranteed:pay before the payment keeper')
  verifierPath = 'verifier/xrp/Payment/prepareRequest'
  request = {
    attestationType: encodeBytes32String('Payment'), sourceId: encodeBytes32String('testXRP'),
    requestBody: { transactionId: rfq.xrplTxHash.replace(/^0x/i, ''), inUtxo: '0', utxo: '0' },
  }
  responseType = 'tuple(bytes32 attestationType,bytes32 sourceId,uint64 votingRound,uint64 lowestUsedTimestamp,tuple(bytes32 transactionId,uint256 inUtxo,uint256 utxo) requestBody,tuple(uint64 blockNumber,uint64 blockTimestamp,bytes32 sourceAddressHash,bytes32 sourceAddressesRoot,bytes32 receivingAddressHash,bytes32 intendedReceivingAddressHash,int256 spentAmount,int256 intendedSpentAmount,int256 receivedAmount,int256 intendedReceivedAmount,bytes32 standardPaymentReference,bool oneToOne,uint8 status) responseBody)'
} else {
  const latestBlock = await signer.provider.getBlock('latest')
  if (Number(latestBlock.timestamp) <= Number(rfq.deliveryDeadline)) throw new Error(`Non-payment proof opens after ${new Date(Number(rfq.deliveryDeadline) * 1000).toISOString()}`)
  const deadlineLedger = Number(rfq.deadlineLedgerIndex || await xrplLedgerAtOrBefore(rfq.deliveryDeadline))
  verifierPath = 'verifier/xrp/ReferencedPaymentNonexistence/prepareRequest'
  request = {
    attestationType: encodeBytes32String('ReferencedPaymentNonexistence'), sourceId: encodeBytes32String('testXRP'),
    requestBody: {
      minimalBlockNumber: String(rfq.matchLedgerIndex), deadlineBlockNumber: String(deadlineLedger),
      deadlineTimestamp: String(rfq.deliveryDeadline), destinationAddressHash: rfq.destinationHash,
      amount: String(rfq.xrpAmountDrops), standardPaymentReference: rfq.paymentReference,
      checkSourceAddresses: false, sourceAddressesRoot: ZeroHash,
    },
  }
  responseType = 'tuple(bytes32 attestationType,bytes32 sourceId,uint64 votingRound,uint64 lowestUsedTimestamp,tuple(uint64 minimalBlockNumber,uint64 deadlineBlockNumber,uint64 deadlineTimestamp,bytes32 destinationAddressHash,uint256 amount,bytes32 standardPaymentReference,bool checkSourceAddresses,bytes32 sourceAddressesRoot) requestBody,tuple(uint64 minimalBlockTimestamp,uint64 firstOverflowBlockNumber,uint64 firstOverflowBlockTimestamp) responseBody)'
}

const verifierUrl = new URL(verifierPath, 'https://fdc-verifiers-testnet.flare.network/').toString()
const preparedResponse = await retry(() => fetch(verifierUrl, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify(request),
}), 10)
const preparedText = await preparedResponse.text()
if (!preparedResponse.ok) throw new Error(`Verifier ${preparedResponse.status}: ${preparedText}`)
const prepared = JSON.parse(preparedText)
const abiEncodedRequest = prepared.abiEncodedRequest || prepared.data?.abiEncodedRequest
if (!abiEncodedRequest) throw new Error(`Verifier did not return abiEncodedRequest: ${preparedText}`)

const [feeAddress, hubAddress, relayAddress, verificationAddress] = await Promise.all([
  systemAddress('FdcRequestFeeConfigurations', signer), systemAddress('FdcHub', signer),
  systemAddress('Relay', signer), systemAddress('FdcVerification', signer),
])
const feeContract = new Contract(feeAddress, ['function getRequestFee(bytes data) view returns(uint256)'], signer)
const hub = new Contract(hubAddress, ['function requestAttestation(bytes data) payable'], signer)
const relay = new Contract(relayAddress, ['function isFinalized(uint256 protocolId,uint256 votingRoundId) view returns(bool)'], signer)
const verification = new Contract(verificationAddress, ['function fdcProtocolId() view returns(uint8)'], signer)
let requestTxHash = rfq.fdcRequestTxHash
let votingRoundId = Number(rfq.fdcVotingRoundId || 0)
if (!requestTxHash || !votingRoundId) {
  const fee = await retry(() => feeContract.getRequestFee(abiEncodedRequest))
  const requestTx = await hub.requestAttestation(abiEncodedRequest, { value: fee })
  const requestReceipt = await requestTx.wait()
  const requestBlock = await retry(() => signer.provider.getBlock(requestReceipt.blockNumber))
  requestTxHash = requestTx.hash
  votingRoundId = Math.floor((Number(requestBlock.timestamp) - 1_658_430_000) / 90)
  writeJson('deployments/guaranteed-rfq.local.json', {
    ...rfq, fdcMode: mode, fdcRequestTxHash: requestTxHash,
    fdcVotingRoundId: votingRoundId, outcome: 'fdc-requested',
  })
}
const protocolId = await retry(() => verification.fdcProtocolId())
console.log(`fdc.request=${requestTxHash} round=${votingRoundId}`)
for (;;) {
  if (await retry(() => relay.isFinalized(protocolId, votingRoundId))) break
  console.log(`keeper waiting for FDC round ${votingRoundId}`)
  await new Promise((resolve) => setTimeout(resolve, 10_000))
}

const daBase = process.env.COSTON2_DA_LAYER_URL || 'https://ctn2-data-availability.flare.network/'
const daUrl = new URL('api/v1/fdc/proof-by-request-round-raw', daBase).toString()
let proofPayload
for (let attempt = 0; attempt < 30; attempt += 1) {
  if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 10_000))
  const response = await retry(() => fetch(daUrl, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ votingRoundId, requestBytes: abiEncodedRequest }),
  }), 5)
  const text = await response.text()
  if (!response.ok) {
    if ([400, 404].includes(response.status) || response.status >= 500) continue
    throw new Error(`DA Layer ${response.status}: ${text}`)
  }
  const parsed = JSON.parse(text)
  const candidate = parsed.data || parsed
  const responseHex = candidate.response_hex || candidate.responseHex
  const merkleProof = candidate.proof || candidate.merkleProof
  if (responseHex && Array.isArray(merkleProof)) { proofPayload = { responseHex, merkleProof }; break }
}
if (!proofPayload) throw new Error('FDC proof did not finalize within five minutes')

const coder = AbiCoder.defaultAbiCoder()
const responseData = coder.decode([responseType], proofPayload.responseHex)[0]
const proofType = `tuple(bytes32[] merkleProof,${responseType} data)`
const encodedProof = coder.encode([proofType], [[proofPayload.merkleProof, responseData]])
const escrow = new Contract(deploymentState.contracts.guaranteedEscrow, artifact('contracts/CinderGuaranteedEscrow.sol', 'CinderGuaranteedEscrow').abi, signer)
let resolutionTx
if (mode === 'payment') {
  await escrow.settleWithPaymentProof.staticCall(rfq.rfqId, encodedProof)
  resolutionTx = await escrow.settleWithPaymentProof(rfq.rfqId, encodedProof)
} else {
  await escrow.resolveNonPayment.staticCall(rfq.rfqId, encodedProof)
  resolutionTx = await escrow.resolveNonPayment(rfq.rfqId, encodedProof)
}
await resolutionTx.wait()

const updated = { ...rfq, fdcMode: mode, fdcRequestTxHash: requestTxHash, fdcVotingRoundId: votingRoundId, fdcProof: encodedProof, resolutionTxHash: resolutionTx.hash, outcome: mode === 'payment' ? 'settled' : 'non-payment-proved-and-slashed' }
writeJson('deployments/guaranteed-rfq.local.json', updated)
const configPath = 'deployments/config.js'
const configSource = fs.readFileSync(configPath, 'utf8')
const configMatch = configSource.match(/window\.CINDER_CONFIG\s*=\s*([\s\S]*);\s*$/)
const publicConfig = configMatch ? JSON.parse(configMatch[1]) : { chainId: 114 }
publicConfig.guaranteedReference = {
  rfqId: rfq.rfqId, outcome: updated.outcome, winner: rfq.winner, stableAsset: 'USDT0', bondAsset: 'FXRP',
  transactions: { create: rfq.createTxHash, finalize: rfq.finalizeTxHash, xrpl: rfq.xrplTxHash, fdcRequest: requestTx.hash, resolution: resolutionTx.hash },
}
writeText(configPath, `window.CINDER_CONFIG = ${JSON.stringify(publicConfig, null, 2)};\n`)
console.log(`keeper.resolution=${resolutionTx.hash} outcome=${updated.outcome}`)
