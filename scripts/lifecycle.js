import fs from 'node:fs';
import { Contract, formatUnits, parseUnits } from 'ethers';
import { assertSepolia, connect, erc20Abi, readArtifact, requireAddress, send, pause } from './common.js';

const { provider, wallet } = connect();
const result = { network: 'Sepolia', wallet: wallet.address, stages: [] };
try {
  await assertSepolia(provider);
  const tokenAAddress = requireAddress('TOKEN_A_ADDRESS');
  const tokenBAddress = requireAddress('TOKEN_B_ADDRESS');
  const vaultAddress = requireAddress('VAULT_ADDRESS');
  const tokenA = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenB = new Contract(tokenBAddress, erc20Abi, wallet);
  const vaultArtifact = readArtifact('AutoCompoundVault');
  const vault = new Contract(vaultAddress, vaultArtifact.abi, wallet);
  const router = new Contract(process.env.ROUTER_ADDRESS || '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3', [
    'function getAmountsOut(uint256,address[]) view returns(uint256[])'
  ], provider);
  const assetDecimals = Number(await tokenA.decimals());
  const rewardDecimals = Number(await tokenB.decimals());
  const shareDecimals = Number(await vault.decimals());
  const depositAmount = parseUnits(process.env.DEPOSIT_AMOUNT || '1000', assetDecimals);
  const rewardAmount = parseUnits(process.env.REWARD_AMOUNT || '100', rewardDecimals);
  const slippageBps = BigInt(process.env.SLIPPAGE_BPS || '100');
  if (slippageBps < 0n || slippageBps > 5000n) throw new Error('SLIPPAGE_BPS must be between 0 and 5000');
  const pairPath = [tokenBAddress, tokenAAddress];
  const quote = (await router.getAmountsOut(rewardAmount, pairPath))[1];
  const minOut = quote * (10000n - slippageBps) / 10000n;

  const balance = await tokenA.balanceOf(wallet.address);
  const rewardBalance = await tokenB.balanceOf(wallet.address);
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Token A: ${await tokenA.symbol()} at ${tokenAAddress}; balance ${formatUnits(balance, assetDecimals)}`);
  console.log(`Token B: ${await tokenB.symbol()} at ${tokenBAddress}; balance ${formatUnits(rewardBalance, rewardDecimals)}`);
  if (balance < depositAmount) {
    throw new Error(`Not enough ${await tokenA.symbol()}: have ${formatUnits(balance, assetDecimals)}, need ${formatUnits(depositAmount, assetDecimals)}. Check TOKEN_A_ADDRESS and that PRIVATE_KEY is the wallet holding the Lab 4 Sepolia tokens.`);
  }
  if (rewardBalance < rewardAmount) {
    throw new Error(`Not enough ${await tokenB.symbol()}: have ${formatUnits(rewardBalance, rewardDecimals)}, need ${formatUnits(rewardAmount, rewardDecimals)}. Check TOKEN_B_ADDRESS and the wallet holding the Lab 4 Sepolia tokens.`);
  }

  console.log('Stage 1/4 — approve and deposit');
  await send(tokenA.approve(vaultAddress, depositAmount), 'Approve Token A');
  const depositReceipt = await send(vault.deposit(depositAmount, wallet.address), 'Deposit');
  const shares = await vault.balanceOf(wallet.address);
  const assetsBefore = await vault.convertToAssets(shares);
  console.log(`Deposited: ${formatUnits(depositAmount, assetDecimals)} ${await tokenA.symbol()}`);
  console.log(`Shares minted: ${formatUnits(shares, shareDecimals)} vTA`);
  console.log(`convertToAssets before compound: ${formatUnits(assetsBefore, assetDecimals)} ${await tokenA.symbol()}`);
  result.stages.push({ name: 'deposit', transaction: depositReceipt.hash, assets: depositAmount.toString(), shares: shares.toString(), convertedAssets: assetsBefore.toString() });
  await pause('Після approve і депозиту');

  console.log('\nStage 2/4 — simulate a reward harvest with an ordinary ERC-20 transfer');
  const rewardReceipt = await send(tokenB.transfer(vaultAddress, rewardAmount), 'Send reward tokens to Vault');
  console.log(`Reward transferred: ${formatUnits(rewardAmount, rewardDecimals)} ${await tokenB.symbol()}`);
  result.stages.push({ name: 'reward-transfer', transaction: rewardReceipt.hash, reward: rewardAmount.toString() });
  await pause('Після прямого переказу Token B у Vault');

  console.log('\nStage 3/4 — anyone can call compound');
  console.log(`Router quote: ${formatUnits(quote, assetDecimals)} ${await tokenA.symbol()}`);
  console.log(`Minimum output (${Number(slippageBps) / 100}% slippage): ${formatUnits(minOut, assetDecimals)} ${await tokenA.symbol()}`);
  const assetsBeforeCompound = await tokenA.balanceOf(vaultAddress);
  const compoundReceipt = await send(vault.compound(minOut), 'Compound');
  const received = await tokenA.balanceOf(vaultAddress) - assetsBeforeCompound;
  console.log(`Vault received from swap: ${formatUnits(received, assetDecimals)} ${await tokenA.symbol()}`);
  result.stages.push({ name: 'compound', transaction: compoundReceipt.hash, minOut: minOut.toString(), received: received.toString() });
  await pause('Після успішного компаундингу');

  console.log('\nStage 4/4 — compare share value');
  const assetsAfter = await vault.convertToAssets(shares);
  console.log(`Shares unchanged: ${formatUnits(await vault.balanceOf(wallet.address), shareDecimals)} vTA`);
  console.log(`convertToAssets after compound: ${formatUnits(assetsAfter, assetDecimals)} ${await tokenA.symbol()}`);
  console.log(`Increase over initial deposit: ${formatUnits(assetsAfter - depositAmount, assetDecimals)} ${await tokenA.symbol()}`);
  if (assetsAfter <= depositAmount) throw new Error('Share value did not increase. Confirm the pool price and reward amount, then rerun with a useful reward amount.');
  result.stages.push({ name: 'valuation', shares: shares.toString(), assetsBefore: assetsBefore.toString(), assetsAfter: assetsAfter.toString() });
  result.passed = true;
  fs.mkdirSync('results', { recursive: true });
  fs.writeFileSync('results/run.json', JSON.stringify(result, null, 2));
  console.log('\nPASS — the same shares now redeem for more Token A than the original deposit.');
  console.log('Saved results/run.json');
} catch (error) {
  fs.mkdirSync('results', { recursive: true });
  result.passed = false;
  result.error = error.shortMessage || error.message;
  fs.writeFileSync('results/run.json', JSON.stringify(result, null, 2));
  throw error;
} finally {
  provider.destroy();
}
