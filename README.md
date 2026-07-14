# Cinder

Cinder is a commit–reveal RFQ market for buying native XRP with escrow on Flare.

**Live application:** [cinder-beta.vercel.app](https://cinder-beta.vercel.app)  
**Source:** [github.com/0xNexuz/cinder](https://github.com/0xNexuz/cinder)

A buyer locks a Flare token and specifies an XRPL destination. Makers submit hashes of their XRP prices while bidding is open, then reveal those prices after the bidding deadline. The Coston2 contract selects the lowest valid quote inside the live FTSOv2 XRP/USD band. The winning maker sends native XRP with the contract-generated payment reference. Flare Data Connector verifies that XRPL payment before the escrow releases funds.

## Try the live demo

Open the deployed site and select **Testnet Lab**.

1. Connect a test wallet to Coston2, chain ID `114`.
2. Get C2FLR from the linked Flare faucet for gas.
3. Click **Claim 100 dcUSD**. This creates a real Coston2 transaction.
4. Click **Approve + create** to lock 10 dcUSD in a new RFQ.
5. Submit a hidden quote. Its salt is generated and retained in that browser.
6. Reveal after the bidding timer, then finalize after the reveal timer.
7. Open every transaction hash directly from the Lab output.

The browser Lab covers real Coston2 escrow and matching transactions. The completed reference trade below additionally proves the XRPL and FDC settlement legs.

Verified Lab smoke test from a separate wallet:

| Lab action | Transaction |
| --- | --- |
| Claim 100 dcUSD | [`0x900d…976a`](https://coston2-explorer.flare.network/tx/0x900d9f809563518c8a363ff24ad9df95a926daae57173fc5829b9832b144976a) |
| Approve escrow | [`0x7f08…cbab`](https://coston2-explorer.flare.network/tx/0x7f08cfc3f41be3cde60e6ff29149e7ea01002a8c0cc4c29e97413ca43453cbab) |
| Create RFQ | [`0x8390…8fb3`](https://coston2-explorer.flare.network/tx/0x839092b2664f91a58dfb565acc752e171e38b9b72b24d14d320905995cce8fb3) |
| Commit hidden quote | [`0xcbc7…9a52`](https://coston2-explorer.flare.network/tx/0xcbc79fe07704de4f567329c3c633441a33d78236e2bf8ca1be159d6650029a52) |
| Reveal quote | [`0x6e65…24ea`](https://coston2-explorer.flare.network/tx/0x6e65eb6381bad2a704a9a8d8485042925eda583b597035bdc30cb5d3da7f24ea) |
| Finalize match | [`0x9c5f…dbdf`](https://coston2-explorer.flare.network/tx/0x9c5f5d5fca9532c07271fd71cff86e08939b879b017acb1c896b8745c309dbdf) |

## Verified cross-chain trade

Reference execution: commit–reveal RFQ `#1`, 10 XRP delivered, 10 cUSD released.

| Event | Verifiable evidence |
| --- | --- |
| Escrow creation and commitments | [`0x0a7f…7bf8`](https://coston2-explorer.flare.network/tx/0x0a7f2ba87ca9439ec967f63356d032bd08fc8d7c31eb9a87adc5fa5e0c5c7bf8) |
| Lowest quote finalized | [`0x3f12…5d9b`](https://coston2-explorer.flare.network/tx/0x3f1269fda3f4251e7f2bcf850ee6ed9322f55d3b7c574fb959653de1beed5d9b) |
| 10 XRP payment | [`C396…610C`](https://testnet.xrpl.org/transactions/C3968091D074B48C6DABC34FAEA4B5B59B934476D160561279E8C8FD0A37610C) |
| FDC request | [`0xd4f5…9c85`](https://coston2-explorer.flare.network/tx/0xd4f58ba01a8f7e10ef5957f1ace6aafc40fadad6bd4679098deaf92e7d3c9c85) |
| FDC-verified release | [`0x605c…8c4e`](https://coston2-explorer.flare.network/tx/0x605c8544ed2391fdfbdc199c1f19442361b83bba71d800d31d756149547e8c4e) |

`npm run flow:verify` independently checks that the RFQ is settled, the XRPL transaction is validated with `tesSUCCESS`, and the winning maker received the escrow.

## Deployed contracts

All application contracts are on Flare Testnet Coston2.

| Contract | Address |
| --- | --- |
| Commit–reveal escrow | [`0x02F8…Cd99`](https://coston2-explorer.flare.network/address/0x02F86e0e1c31bfD8023A065DBc04202572DbCd99) |
| Public one-claim demo token | [`0x1B4D…3670`](https://coston2-explorer.flare.network/address/0x1B4D54c28Eb7Aa002DBb5d2B7740bC863B813670) |
| FTSOv2 XRP/USD adapter | [`0xcB10…60BF`](https://coston2-explorer.flare.network/address/0xcB10895076A8a2b5E2e719CEd7fC43f906Af60BF) |
| FDC XRPL Payment adapter | [`0x0F95…3FFB`](https://coston2-explorer.flare.network/address/0x0F95553e4a2B1B9672bEf526c8eb274b73333FFB) |

## Why Flare is required

- Coston2 holds the buyer's escrow and enforces the RFQ deadlines.
- FTSOv2 rejects a winning quote outside the buyer's permitted XRP/USD deviation.
- FDC proves the exact XRPL destination, amount and 32-byte payment reference before release.
- The XRPL transaction hash is marked consumed, preventing one payment proof from releasing multiple escrows.

## Privacy and trust model

Prices are hidden during bidding because only `keccak256(abi.encode(rfqId, maker, price, salt))` is published. A reveal that does not match the original commitment is rejected. Prices become public during the reveal phase; Cinder provides bidding privacy, not permanent TEE secrecy. Matching and settlement require no Cinder operator key.

## Local verification

```bash
npm install
npm run contracts:check
npm test
npm run flow:verify
```

To execute a fresh automated cross-chain testnet run, copy `.env.example` to `.env`, use testnet-only keys, then run:

```bash
npm run accounts:create
npm run network:check
npm run deploy:coston2
npm run deploy:matcher
npm run deploy:demo-token
npm run flow:commit-reveal
npm run flow:xrpl
npm run flow:fdc
npm run flow:settle
npm run flow:verify
```

The full flow uses real testnet assets and can take several minutes while commit–reveal and FDC voting windows finalize. `.env` and generated local deployment state are excluded from Git.


Presentation assets:

- [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — three-minute live presentation walkthrough.
- [`video/DEMO_VIDEO_DRAFT.md`](./video/DEMO_VIDEO_DRAFT.md) — 75-second video storyboard and cursor plan.
- [`video/voiceover.txt`](./video/voiceover.txt) — final narration copy.
- [`video/captions.srt`](./video/captions.srt) — timed draft captions.
