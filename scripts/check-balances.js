import { Contract, formatUnits, parseUnits } from 'ethers';
import { assertSepolia, connect, erc20Abi, requireAddress } from './common.js';

const { provider, wallet } = connect();
try {
  await assertSepolia(provider);
  const tokenAAddress = requireAddress('TOKEN_A_ADDRESS');
  const tokenBAddress = requireAddress('TOKEN_B_ADDRESS');
  const tokenA = new Contract(tokenAAddress, erc20Abi, provider);
  const tokenB = new Contract(tokenBAddress, erc20Abi, provider);
  const [aSymbol, aDecimals, aBalance, bSymbol, bDecimals, bBalance] = await Promise.all([
    tokenA.symbol(), tokenA.decimals(), tokenA.balanceOf(wallet.address),
    tokenB.symbol(), tokenB.decimals(), tokenB.balanceOf(wallet.address)
  ]);
  const deposit = parseUnits(process.env.DEPOSIT_AMOUNT || '1000', Number(aDecimals));
  const reward = parseUnits(process.env.REWARD_AMOUNT || '100', Number(bDecimals));
  console.log(`Network: Sepolia (chainId 11155111)`);
  console.log(`Wallet from PRIVATE_KEY: ${wallet.address}`);
  console.log(`Token A: ${aSymbol} (${tokenAAddress})`);
  console.log(`Token A balance: ${formatUnits(aBalance, aDecimals)}; required: ${formatUnits(deposit, aDecimals)}`);
  console.log(`Token B: ${bSymbol} (${tokenBAddress})`);
  console.log(`Token B balance: ${formatUnits(bBalance, bDecimals)}; required for reward simulation: ${formatUnits(reward, bDecimals)}`);
  if (aBalance < deposit || bBalance < reward) process.exitCode = 1;
} finally {
  provider.destroy();
}
