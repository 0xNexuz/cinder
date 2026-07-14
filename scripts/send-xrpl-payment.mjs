import fs from 'node:fs'
import { Client, Wallet, xrpToDrops } from 'xrpl'
import { required, root, writeJson } from './common.mjs'

const rfqPath = `${root}/deployments/rfq.local.json`
const rfq = JSON.parse(fs.readFileSync(rfqPath, 'utf8'))
if (!rfq.paymentReference) throw new Error('RFQ is not matched; run npm run flow:match')

const client = new Client(
  process.env.XRPL_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233',
  { connectionTimeout: 30_000, timeout: 30_000 },
)
await client.connect()
try {
  const buyer = Wallet.fromSeed(required('XRPL_BUYER_SEED'))
  const maker = Wallet.fromSeed(required('XRPL_MAKER_SEED'))

  for (const wallet of [buyer, maker]) {
    try {
      await client.request({ command: 'account_info', account: wallet.address, ledger_index: 'validated' })
    } catch {
      console.log(`Funding XRPL Testnet account ${wallet.address}`)
      await client.fundWallet(wallet)
    }
  }

  const payment = await client.autofill({
    TransactionType: 'Payment',
    Account: maker.address,
    Destination: buyer.address,
    Amount: xrpToDrops(Number(rfq.xrpAmountDrops) / 1_000_000),
    Memos: [{
      Memo: {
        MemoType: Buffer.from('CINDER', 'utf8').toString('hex').toUpperCase(),
        MemoData: rfq.paymentReference.slice(2).toUpperCase(),
      },
    }],
  })
  const signed = maker.sign(payment)
  const result = await client.submitAndWait(signed.tx_blob)
  const txHash = signed.hash
  const resultCode = result.result.meta?.TransactionResult
  if (resultCode !== 'tesSUCCESS') throw new Error(`XRPL payment failed: ${resultCode}`)

  writeJson('deployments/rfq.local.json', {
    ...rfq,
    xrplMaker: maker.address,
    xrplBuyer: buyer.address,
    xrplTxHash: txHash,
    xrplLedgerIndex: result.result.ledger_index,
  })
  console.log(`XRPL Testnet payment confirmed: ${txHash}`)
} finally {
  await client.disconnect()
}
