# FCC production handoff

The live settlement path is complete except for replacing `scripts/match-rfq.mjs` with a registered Flare Confidential Compute extension result.

## External prerequisites

1. Install and start Docker Desktop.
2. Install Foundry and ensure `forge` is available.
3. Obtain read-only Coston2 indexer credentials from Flare support.
4. Start an HTTPS tunnel to local port 6674 and record its public URL.

## Scaffold

The official extension scaffold is cloned at:

`C:/Users/USER/Documents/Codex/2026-07-13/th/work/cinder-fcc`

Configure its Coston2 proxy TOML, activate the local Coston2 environment, then deploy and register the extension using the scaffold's scripts. The final application change is to route encrypted quote payloads through the extension registry and pass the TEE-signed `ActionResult` into a fresh Cinder escrow deployment.

## Acceptance test

The FCC leg is complete only when all of these are true:

- the extension ID and TEE machine are registered on Coston2;
- quote plaintext is not written to Coston2 or browser logs;
- the TEE returns the winning maker, clearing price, and payment reference;
- a fresh RFQ's `MatchFinalized` transaction verifies the registered TEE result;
- the same RFQ completes XRPL payment, FDC proof, and settlement.
