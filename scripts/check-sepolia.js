import assert from 'node:assert/strict';
import { Contract } from 'ethers';
import { assertSepolia, connect, erc20Abi, factoryAbi, requireAddress, ROUTER_DEFAULT, routerAbi } from './common.js';

const { provider, wallet } = connect();
try {
  await assertSepolia(provider);
  const tokenA = requireAddress('TOKEN_A_ADDRESS');
  const tokenB = requireAddress('TOKEN_B_ADDRESS');
  const routerAddress = process.env.ROUTER_ADDRESS || ROUTER_DEFAULT;
  assert.notEqual((await provider.getCode(routerAddress)), '0x', 'Router has no contract code');
  assert.notEqual((await provider.getCode(tokenA)), '0x', 'Token A has no contract code');
  assert.notEqual((await provider.getCode(tokenB)), '0x', 'Token B has no contract code');

  const router = new Contract(routerAddress, routerAbi, provider);
  const factoryAddress = await router.factory();
  const factory = new Contract(factoryAddress, factoryAbi, provider);
  const pair = await factory.getPair(tokenA, tokenB);
  if (pair === '0x0000000000000000000000000000000000000000') {
    throw new Error('Uniswap V2 pair does not exist. Create and fund this pair through Lab 4 first.');
  }
  const [a, b] = await Promise.all([
    new Contract(tokenA, erc20Abi, provider), new Contract(tokenB, erc20Abi, provider)
  ]);
  const amount = 10n ** BigInt(await a.decimals());
  const quote = await router.getAmountsOut(amount, [tokenA, tokenB]);
  assert(quote[1] > 0n, 'The Token A / Token B pair has no usable liquidity');

  console.log('Network: Ethereum Sepolia');
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Sepolia ETH: ${Number(await provider.getBalance(wallet.address)) / 1e18}`);
  console.log(`Token A: ${await a.symbol()} (${tokenA})`);
  console.log(`Token B: ${await b.symbol()} (${tokenB})`);
  console.log(`Uniswap V2 Router: ${routerAddress}`);
  console.log(`Pair: ${pair}`);
  console.log('RPC, contracts and swap liquidity: PASS');
} finally {
  provider.destroy();
}
