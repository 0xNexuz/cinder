# Cinder Guaranteed RFQ

Cinder is a guaranteed private RFQ rail for buying native XRP without trusting a broker. Buyers escrow USDT0 on Flare, independent makers compete through sealed quotes and lock FXRP performance bonds, FTSOv2 constrains the execution price, and Flare Data Connector proves either XRP delivery or non-payment.

- Live application: [cinder-beta.vercel.app](https://cinder-beta.vercel.app)
- Documentation: [cinder-beta.vercel.app/docs](https://cinder-beta.vercel.app/docs)
- Source: [github.com/0xNexuz/cinder](https://github.com/0xNexuz/cinder)
- Networks: Flare Testnet Coston2 (chain `114`) and XRPL Testnet

## Why Cinder exists

A cross-chain XRP trade normally makes either the buyer or maker move first. Cinder replaces that trust gap with four enforceable guarantees:

1. The buyer's USDT0 is locked before makers compete.
2. Makers cannot copy visible prices during bidding because quotes are committed as salted hashes.
3. The winner locks FXRP that is returned after delivery or slashed after default.
4. FDC, not a Cinder operator, proves whether the referenced XRPL payment occurred.

## Real testnet outcomes

### RFQ #3: delivery and settlement

Two independent maker wallets competed for a 2 XRP order. Maker 1 won at `$1.145771/XRP`; maker 2 quoted `$1.151505/XRP`.

| Event | Evidence |
| --- | --- |
| 2 USDT0 escrow created | [`0x784b...c78d`](https://coston2-explorer.flare.network/tx/0x784bc2d83d57365efe4021646434accd3d7ffcac9a48a6fe08db67ff3a74c78d) |
| Maker 1 commitment | [`0x1930...6b96`](https://coston2-explorer.flare.network/tx/0x1930a3ac2c412697c9ac72c46ab5280c69dad13ae14223862cf5a76277816b96) |
| Maker 2 commitment | [`0xa8b4...241e`](https://coston2-explorer.flare.network/tx/0xa8b41035b26b4a866592a14d8668d93ca0a3d9e0f2bbf75374fed13972d5241e) |
| Maker 1 reveal | [`0xd9ed...244e`](https://coston2-explorer.flare.network/tx/0xd9ed9896cfe48cc26af1ca3766dc44685c8b2fcb3de4643be71a1a8f2be6244e) |
| Maker 2 reveal | [`0x248c...251c`](https://coston2-explorer.flare.network/tx/0x248cc580c3068e6b1e073cd305c58e89bab6c0272350c0d8128448987932251c) |
| Lowest quote finalized | [`0x4077...198c`](https://coston2-explorer.flare.network/tx/0x4077abb354d026680d0948aaf02f864fe0f838a4dc333d1444968d2d3f01198c) |
| 2 XRP delivered | [`EE8A...8267`](https://testnet.xrpl.org/transactions/EE8A1987DDE14991AE137D38EBC055936C7D9FE79502A8F4D65667F321FE8267) |
| FDC Payment request | [`0x7731...0caf`](https://coston2-explorer.flare.network/tx/0x773179cab9c5a52b313be8e5a03832ad0b548eb023090c0c661280c2d93a0caf) |
| 2 USDT0 released; 1 FXRP returned | [`0x056a...9ddf`](https://coston2-explorer.flare.network/tx/0x056a36475f3e95dcca98832863583e5274ab7aa24cf231406e7197b535d59ddf) |

### RFQ #1: non-payment default

The winning maker did not deliver XRP before the five-minute deadline. FDC proved non-existence across the specified XRPL ledger window.

| Event | Evidence |
| --- | --- |
| 2 USDT0 escrow created | [`0x9072...312d`](https://coston2-explorer.flare.network/tx/0x9072699d5c7545c40b663cf2fb89b0cb5dce73f52e6e86a05444dc0ecda3312d) |
| Winner finalized | [`0x9a21...e43f`](https://coston2-explorer.flare.network/tx/0x9a21e16704c8283202e8abce1b79d7149bbdb91057a7f21caed52837c946e43f) |
| FDC ReferencedPaymentNonexistence request | [`0x65df...1bfe`](https://coston2-explorer.flare.network/tx/0x65df49488eba4d7de451f5a831e1e774ed2bd9988e315797ba9b9892f91a1bfe) |
| 2 USDT0 refunded; 1 FXRP slashed | [`0x5e81...0837`](https://coston2-explorer.flare.network/tx/0x5e81491036c49cdc4ff8760d1eeba4d3c66141bc49343028cd016de34ccf0837) |

## Architecture

| Module | Responsibility | Coston2 address |
| --- | --- | --- |
| `CinderGuaranteedEscrow` | USDT0 custody and dual-outcome settlement | [`0x27DA...4744`](https://coston2-explorer.flare.network/address/0x27DAa2d5BfDD9A3C7657baDc59E91c3649f14744) |
| `CinderCommitRevealMatcherV2` | Domain-separated two-phase quote competition | [`0x166a...6AE0`](https://coston2-explorer.flare.network/address/0x166aB7D743Fc71dAd7Dba19957fd3465531b6AE0) |
| `CinderBondVault` | FXRP lock, release and slash accounting | [`0xE009...37CF`](https://coston2-explorer.flare.network/address/0xE0095bA27bce7a8c82eBf0e00F1C54eF552737CF) |
| `XrplFdcSettlementAdapter` | Payment and non-payment proof validation | [`0x662b...5B01`](https://coston2-explorer.flare.network/address/0x662bEAf80369aa2A2b9BAcd17cd5dDbA8Ec15B01) |
| `FtsoXrpUsdAdapter` | Live XRP/USD price guard | [`0xcB10...60BF`](https://coston2-explorer.flare.network/address/0xcB10895076A8a2b5E2e719CEd7fC43f906Af60BF) |

Official Coston2 assets:

- USDT0: [`0xC1A5...E71F`](https://coston2-explorer.flare.network/address/0xC1A5B41512496B80903D1f32d6dEa3a73212E71F)
- FXRP: [`0x0b6A...3dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7)

The matcher is deliberately separate. Commit-reveal V2 is live today; an FCC matcher can later implement the same boundary when its runtime is dependable. This repository does not claim a live FCC deployment.

## Run locally

```bash
npm install
npm run contracts:check
npm test
```

For a fresh guaranteed testnet execution, configure testnet-only keys in `.env` and run:

```bash
npm run deploy:guaranteed
npm run guaranteed:auction
npm run guaranteed:pay
npm run guaranteed:keeper
```

For an expired unpaid RFQ:

```bash
npm run guaranteed:default
```

The proof keeper checkpoints FDC request hashes and voting rounds, derives XRPL ledger boundaries for non-payment proofs, and resumes after transient RPC or Data Availability failures without duplicating an accepted request.

## Public demo separation

The primary interface displays the production-shaped USDT0/FXRP guarantee and verifies its real transaction receipts. A separate public sandbox uses a one-claim dcUSD token with the V1 escrow so any judge can create a fresh Coston2 hash without access to controlled maker keys or scarce FXRP test liquidity.

## New work in this program

- Guaranteed USDT0 escrow and explicit payment/default state machine.
- Isolated FXRP bond vault with return and slash paths.
- Two-independent-maker matcher V2.
- FDC Payment and ReferencedPaymentNonexistence adapter.
- Resumable proof-automation keeper and XRPL ledger-boundary discovery.
- Real XRPL payment, real FDC settlement, real non-payment refund and real bond slash.
- Reworked public proof console, documentation and transaction sandbox.

## Next steps

1. Audit the escrow, matcher and vault; add invariant and adversarial property tests.
2. Onboard independent maker operators and expose a quote API.
3. Pilot with XRP payment businesses and treasury desks using controlled limits.
4. Add an FCC matcher adapter when the runtime is dependable.
5. Deploy to Flare Mainnet after audit and pilot validation.

Secrets and generated local deployment state are excluded from Git.
