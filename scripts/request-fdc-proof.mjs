import fs from 'node:fs'
import { setDefaultResultOrder } from 'node:dns'
import { AbiCoder, Contract, encodeBytes32String } from 'ethers'
import {
  deployer,
  required,
  root,
  systemAddress,
  writeJson,
} from './common.mjs'

const rfqPath = `${root}/deployments/rfq.local.json`
setDefaultResultOrder('ipv4first')
const rfq = JSON.parse(fs.readFileSync(rfqPath, 'utf8'))
if (!rfq.xrplTxHash) throw new Error('Missing XRPL transaction; run npm run flow:xrpl')

async function retry(operation, attempts = 8) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 2_000 * (attempt + 1))))
    }
  }
  throw lastError
}

const apiKey = process.env.VERIFIER_API_KEY_TESTNET || '00000000-0000-0000-0000-000000000000'
const verifierUrl = 'https://fdc-verifiers-testnet.flare.network/verifier/xrp/Payment/prepareRequest'
const request = {
  attestationType: encodeBytes32String('Payment'),
  sourceId: encodeBytes32String('testXRP'),
  requestBody: {
    transactionId: rfq.xrplTxHash.replace(/^0x/i, ''),
    inUtxo: '0',
    utxo: '0',
  },
}

const preparedResponse = await retry(() => fetch(verifierUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify(request),
}), 10)
const preparedText = await preparedResponse.text()
if (!preparedResponse.ok) throw new Error(`Verifier ${preparedResponse.status}: ${preparedText}`)
const prepared = JSON.parse(preparedText)
const abiEncodedRequest = prepared.abiEncodedRequest || prepared.data?.abiEncodedRequest
if (!abiEncodedRequest) throw new Error(`Verifier did not return abiEncodedRequest: ${preparedText}`)

const signer = deployer()
const [feeAddress, hubAddress, relayAddress, verificationAddress] = await Promise.all([
  systemAddress('FdcRequestFeeConfigurations', signer),
  systemAddress('FdcHub', signer),
  systemAddress('Relay', signer),
  systemAddress('FdcVerification', signer),
])
const feeContract = new Contract(feeAddress, [
  'function getRequestFee(bytes data) view returns (uint256)',
], signer)
const hub = new Contract(hubAddress, [
  'function requestAttestation(bytes data) payable',
], signer)
const relay = new Contract(relayAddress, [
  'function isFinalized(uint256 protocolId,uint256 votingRoundId) view returns (bool)',
], signer)
const verification = new Contract(verificationAddress, [
  'function fdcProtocolId() view returns (uint8)',
], signer)
let requestTxHash = process.env.FDC_REQUEST_TX_HASH || rfq.fdcRequestTxHash
let requestReceipt
if (requestTxHash) {
  requestReceipt = await retry(() => signer.provider.getTransactionReceipt(requestTxHash))
  if (!requestReceipt) throw new Error(`FDC request transaction not found: ${requestTxHash}`)
} else {
  const fee = await retry(() => feeContract.getRequestFee(abiEncodedRequest))
  const requestTx = await hub.requestAttestation(abiEncodedRequest, { value: fee })
  requestReceipt = await requestTx.wait()
  requestTxHash = requestTx.hash
}
const requestBlock = await retry(() => signer.provider.getBlock(requestReceipt.blockNumber))
const votingRoundId = Math.floor((requestBlock.timestamp - 1_658_430_000) / 90)
const protocolId = await retry(() => verification.fdcProtocolId())
writeJson('deployments/rfq.local.json', {
  ...rfq,
  fdcRequestTxHash: requestTxHash,
  fdcVotingRoundId: votingRoundId,
  fdcAbiEncodedRequest: abiEncodedRequest,
})
console.log(`FDC request confirmed in voting round ${votingRoundId}: ${requestTxHash}`)

for (;;) {
  if (await retry(() => relay.isFinalized(protocolId, votingRoundId))) break
  console.log(`Waiting for FDC voting round ${votingRoundId} to finalize…`)
  await new Promise((resolve) => setTimeout(resolve, 10_000))
}
console.log(`FDC voting round ${votingRoundId} finalized.`)

const daBase = process.env.COSTON2_DA_LAYER_URL || 'https://ctn2-data-availability.flare.network/'
const daUrl = new URL('api/v1/fdc/proof-by-request-round-raw', daBase).toString()
let proofPayload
for (let attempt = 0; attempt < 30; attempt += 1) {
  if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 10_000))
  const response = await retry(() => fetch(daUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ votingRoundId, requestBytes: abiEncodedRequest }),
  }), 5)
  const text = await response.text()
  if (!response.ok) {
    if (response.status >= 500 || response.status === 404 || response.status === 400) continue
    throw new Error(`DA Layer ${response.status}: ${text}`)
  }
  const parsed = JSON.parse(text)
  const candidate = parsed.data || parsed
  const responseHex = candidate.response_hex || candidate.responseHex
  const merkleProof = candidate.proof || candidate.merkleProof
  if (responseHex && Array.isArray(merkleProof)) {
    proofPayload = { responseHex, merkleProof }
    break
  }
  console.log(`FDC proof not finalized yet (${attempt + 1}/30)`)
}
if (!proofPayload) throw new Error('FDC proof did not finalize within five minutes')

const responseType = 'tuple(bytes32 attestationType,bytes32 sourceId,uint64 votingRound,uint64 lowestUsedTimestamp,tuple(bytes32 transactionId,uint256 inUtxo,uint256 utxo) requestBody,tuple(uint64 blockNumber,uint64 blockTimestamp,bytes32 sourceAddressHash,bytes32 sourceAddressesRoot,bytes32 receivingAddressHash,bytes32 intendedReceivingAddressHash,int256 spentAmount,int256 intendedSpentAmount,int256 receivedAmount,int256 intendedReceivedAmount,bytes32 standardPaymentReference,bool oneToOne,uint8 status) responseBody)'
const proofType = `tuple(bytes32[] merkleProof,${responseType} data)`
const coder = AbiCoder.defaultAbiCoder()
const responseData = coder.decode([responseType], proofPayload.responseHex)[0]
const encodedProof = coder.encode([proofType], [[proofPayload.merkleProof, responseData]])

writeJson('deployments/rfq.local.json', {
  ...rfq,
  fdcRequestTxHash: requestTxHash,
  fdcVotingRoundId: votingRoundId,
  fdcAbiEncodedRequest: abiEncodedRequest,
  fdcProof: encodedProof,
})
console.log(`FDC Payment proof finalized for XRPL transaction ${rfq.xrplTxHash}`)
