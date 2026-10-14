import { ContractFactory } from 'ethers';
import { assertSepolia, connect, readArtifact, requireAddress, ROUTER_DEFAULT, send, updateEnv } from './common.js';

const { provider, wallet } = connect();
try {
  await assertSepolia(provider);
  const tokenA = requireAddress('TOKEN_A_ADDRESS');
  const tokenB = requireAddress('TOKEN_B_ADDRESS');
  const router = process.env.ROUTER_ADDRESS || ROUTER_DEFAULT;
  for (const [label, address] of [['Token A', tokenA], ['Token B', tokenB], ['Router', router]]) {
    if ((await provider.getCode(address)) === '0x') throw new Error(`${label} has no code at ${address}`);
  }

  const artifact = readArtifact('AutoCompoundVault');
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const vault = await factory.deploy(tokenA, tokenB, router);
  console.log(`Deployment submitted: ${vault.deploymentTransaction().hash}`);
  await vault.waitForDeployment();
  const address = await vault.getAddress();
  const receipt = await vault.deploymentTransaction().wait();
  updateEnv({ VAULT_ADDRESS: address });
  console.log(`AutoCompoundVault: ${address}`);
  console.log(`Deployment block: ${receipt.blockNumber}`);
  console.log(`Base asset: ${tokenA}`);
  console.log(`Reward token: ${tokenB}`);
  console.log(`Uniswap V2 Router: ${router}`);
  console.log('Saved VAULT_ADDRESS to .env');
} finally {
  provider.destroy();
}
