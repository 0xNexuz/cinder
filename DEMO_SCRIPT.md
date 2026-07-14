# Cinder demo script

Target runtime: 3 minutes.

## 0:00–0:25 — Problem

“Buying native XRP through an OTC desk creates two trust problems. The buyer exposes their intended price before execution, and one party must trust the other to deliver before payment. Cinder removes both problems with commit–reveal matching on Flare and XRPL payment verification through FDC.”

Show the **Overview** section and the completed 10 XRP execution card.

## 0:25–0:55 — Architecture

Open **How it works**.

“The buyer locks funds on Coston2. Makers publish hashes of their prices, so nobody can see or copy a competing quote during bidding. After bidding closes, makers reveal. The contract verifies every reveal, chooses the lowest valid price inside the live FTSOv2 band, and generates one XRPL payment reference. FDC must verify that exact XRP payment before the winner receives escrow.”

## 0:55–1:55 — Real wallet transactions

Open **Testnet Lab**.

1. Connect a test wallet and show chain `114`.
2. If needed, open the Coston2 faucet and obtain C2FLR.
3. Click **Claim 100 dcUSD** and open the returned transaction hash.
4. Click **Approve + create**. Explain that approval and escrow creation are two real wallet confirmations.
5. Click **Submit hidden quote** and open its transaction.

Say: “The quote price is not in this transaction. Only its commitment is public; the random salt stays in this browser until reveal.”

If the bidding window has not closed, continue with the pre-completed execution rather than waiting on camera.

## 1:55–2:30 — Cross-chain proof

Open **Activity**.

Open the XRPL transaction:

`C3968091D074B48C6DABC34FAEA4B5B59B934476D160561279E8C8FD0A37610C`

Show the successful 10 XRP Payment and memo. Then open the Coston2 settlement:

`0x605c8544ed2391fdfbdc199c1f19442361b83bba71d800d31d756149547e8c4e`

Say: “This release did not rely on a screenshot or backend callback. The escrow called the deployed FDC verifier adapter, checked the destination, amount and payment reference, marked the XRPL transaction consumed, and released 10 cUSD.”

## 2:30–3:00 — Close

“Cinder turns native XRP into a safely executable asset for Flare applications. Price competition is private during bidding, matching is permissionless, and settlement is tied to cryptographic evidence of delivery. The next step is onboarding real market makers and routing production stablecoin liquidity.”

End on **Live trade**, with the Coston2 and XRPL explorer buttons visible.
