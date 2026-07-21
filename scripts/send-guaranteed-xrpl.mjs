import fs from 'node:fs'
import { Client, Wallet, xrpToDrops } from 'xrpl'
import { required, root, writeJson } from './common.mjs'

const file = `${root}/deployments/guaranteed-rfq.local.json`
const rfq = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!rfq.paymentReference) throw new Error('Run npm run guaranteed:auction first')

const client = new Client(process.env.XRPL_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233', { connectionTimeout: 30_000, timeout: 30_000 })
await client.connect()
try {
  const maker = Wallet.fromSeed(required('XRPL_MAKER_SEED'))
  try {
    await client.request({ command: 'account_info', account: maker.address, ledger_index: 'validated' })
  } catch {
    await client.fundWallet(maker)
  }
  const payment = await client.autofill({
    TransactionType: 'Payment',
    Account: maker.address,
    Destination: rfq.destination,
    Amount: xrpToDrops(Number(rfq.xrpAmountDrops) / 1_000_000),
    Memos: [{ Memo: { MemoType: Buffer.from('CINDER_GUARANTEED', 'utf8').toString('hex').toUpperCase(), MemoData: rfq.paymentReference.slice(2).toUpperCase() } }],
  })
  const signed = maker.sign(payment)
  const result = await client.submitAndWait(signed.tx_blob)
  const resultCode = result.result.meta?.TransactionResult
  if (resultCode !== 'tesSUCCESS') throw new Error(`XRPL payment failed: ${resultCode}`)
  writeJson('deployments/guaranteed-rfq.local.json', {
    ...rfq,
    xrplMaker: maker.address,
    xrplTxHash: signed.hash,
    xrplLedgerIndex: Number(result.result.ledger_index),
    outcome: 'payment-confirmed-awaiting-fdc',
  })
  console.log(`XRPL payment=${signed.hash}`)
} finally {
  await client.disconnect()
}
