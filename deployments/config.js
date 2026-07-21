window.CINDER_CONFIG = {
  "chainId": 114,
  "rpcUrl": "https://coston2-api.flare.network/ext/C/rpc",
  "explorerUrl": "https://coston2-explorer.flare.network",
  "xrplExplorerUrl": "https://testnet.xrpl.org/transactions",
  "contracts": {
    "token": "0x94c8e2deF5EC8631b8240f7d2B27303a9aD7caa0",
    "oracle": "0xcB10895076A8a2b5E2e719CEd7fC43f906Af60BF",
    "fdcAdapter": "0x0F95553e4a2B1B9672bEf526c8eb274b73333FFB",
    "escrow": "0x02F86e0e1c31bfD8023A065DBc04202572DbCd99",
    "legacyEscrow": "0x8476f78bfaA4f2F3cCEcf8067E87992C90Ef1Bb4",
    "legacyToken": "0x94c8e2deF5EC8631b8240f7d2B27303a9aD7caa0",
    "demoToken": "0x1B4D54c28Eb7Aa002DBb5d2B7740bC863B813670",
    "usdt0": "0xC1A5B41512496B80903D1f32d6dEa3a73212E71F",
    "fxrp": "0x0b6A3645c240605887a5532109323A3E12273dc7",
    "guaranteedEscrow": "0x27DAa2d5BfDD9A3C7657baDc59E91c3649f14744",
    "bondVault": "0xE0095bA27bce7a8c82eBf0e00F1C54eF552737CF",
    "matcherV2": "0x166aB7D743Fc71dAd7Dba19957fd3465531b6AE0",
    "dualFdcAdapter": "0x662bEAf80369aa2A2b9BAcd17cd5dDbA8Ec15B01"
  },
  "rfqId": "1",
  "matcher": "commit-reveal",
  "transactions": {
    "create": "0x0a7f2ba87ca9439ec967f63356d032bd08fc8d7c31eb9a87adc5fa5e0c5c7bf8",
    "match": "0x3f1269fda3f4251e7f2bcf850ee6ed9322f55d3b7c574fb959653de1beed5d9b",
    "xrpl": "C3968091D074B48C6DABC34FAEA4B5B59B934476D160561279E8C8FD0A37610C",
    "fdcRequest": "0xd4f58ba01a8f7e10ef5957f1ace6aafc40fadad6bd4679098deaf92e7d3c9c85",
    "settlement": "0x605c8544ed2391fdfbdc199c1f19442361b83bba71d800d31d756149547e8c4e"
  },
  "guaranteed": {
    "stableAsset": "USDT0",
    "bondAsset": "FXRP",
    "matcher": "commit-reveal-v2",
    "deliveryWindow": 300
  },
  "guaranteedReference": {
    "rfqId": "3",
    "outcome": "settled",
    "winner": "0x4727f9f576e318008780a0B9d323E4F970b38F43",
    "stableAsset": "USDT0",
    "bondAsset": "FXRP",
    "transactions": {
      "create": "0x784bc2d83d57365efe4021646434accd3d7ffcac9a48a6fe08db67ff3a74c78d",
      "finalize": "0x4077abb354d026680d0948aaf02f864fe0f838a4dc333d1444968d2d3f01198c",
      "xrpl": "EE8A1987DDE14991AE137D38EBC055936C7D9FE79502A8F4D65667F321FE8267",
      "fdcRequest": "0x773179cab9c5a52b313be8e5a03832ad0b548eb023090c0c661280c2d93a0caf",
      "resolution": "0x056a36475f3e95dcca98832863583e5274ab7aa24cf231406e7197b535d59ddf"
    }
  },
  "guaranteedDefaultReference": {
    "rfqId": "1",
    "outcome": "non-payment-proved-and-slashed",
    "winner": "0x4727f9f576e318008780a0B9d323E4F970b38F43",
    "stableAsset": "USDT0",
    "bondAsset": "FXRP",
    "transactions": {
      "create": "0x9072699d5c7545c40b663cf2fb89b0cb5dce73f52e6e86a05444dc0ecda3312d",
      "finalize": "0x9a21e16704c8283202e8abce1b79d7149bbdb91057a7f21caed52837c946e43f",
      "fdcRequest": "0x65df49488eba4d7de451f5a831e1e774ed2bd9988e315797ba9b9892f91a1bfe",
      "resolution": "0x5e81491036c49cdc4ff8760d1eeba4d3c66141bc49343028cd016de34ccf0837"
    }
  }
};
