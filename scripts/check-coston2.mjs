import { Contract, formatEther } from 'ethers'
import { deployer, systemAddress } from './common.mjs'

const signer = deployer()
const balance = await signer.provider.getBalance(signer.address)
const names = [
  'FtsoV2',
  'FdcVerification',
  'FdcHub',
  'FdcRequestFeeConfigurations',
  'FlareSystemsManager',
]
const addresses = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await systemAddress(name)])))
const ftso = new Contract(addresses.FtsoV2, [
  'function getFeedById(bytes21 feedId) payable returns (uint256,int8,uint64)',
], signer.provider)
const feed = await ftso.getFeedById.staticCall('0x015852502f55534400000000000000000000000000')

console.log(`Coston2 deployer: ${signer.address}`)
console.log(`C2FLR balance: ${formatEther(balance)}`)
for (const [name, address] of Object.entries(addresses)) console.log(`${name}: ${address}`)
console.log(`XRP/USD raw feed: value=${feed[0]} decimals=${feed[1]} timestamp=${feed[2]}`)
