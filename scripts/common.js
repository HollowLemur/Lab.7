import fs from 'node:fs';
import { Contract, JsonRpcProvider, Wallet, isAddress } from 'ethers';

export const ROUTER_DEFAULT = '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3';
export const routerAbi = [
  'function factory() view returns(address)',
  'function getAmountsOut(uint256,address[]) view returns(uint256[])'
];
export const factoryAbi = ['function getPair(address,address) view returns(address)'];
export const erc20Abi = [
  'function name() view returns(string)', 'function symbol() view returns(string)',
  'function decimals() view returns(uint8)', 'function balanceOf(address) view returns(uint256)',
  'function allowance(address,address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)', 'function transfer(address,uint256) returns(bool)'
];

export function requireAddress(name) {
  const value = process.env[name];
  if (!value || !isAddress(value)) throw new Error(`Set a valid ${name} address in .env`);
  return value;
}

export function readArtifact(name) {
  return JSON.parse(fs.readFileSync(`artifacts/${name}.json`, 'utf8'));
}

export function connect() {
  const rpc = process.env.SEPOLIA_RPC_URL;
  const key = process.env.PRIVATE_KEY || '';
  if (!rpc || rpc.includes('YOUR_ALCHEMY_API_KEY')) throw new Error('Set SEPOLIA_RPC_URL in .env');
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Set PRIVATE_KEY as a 0x-prefixed 32-byte test-wallet key in .env');
  const provider = new JsonRpcProvider(rpc, 11155111, { cacheTimeout: -1 });
  return { provider, wallet: new Wallet(key, provider) };
}

export async function assertSepolia(provider) {
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) throw new Error(`Wrong network chainId ${network.chainId}; use Ethereum Sepolia`);
}

export async function send(txPromise, label) {
  const tx = await txPromise;
  console.log(`${label} transaction: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`${label} reverted in block ${receipt.blockNumber}`);
  console.log(`${label} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

export async function pause(message) {
  if (!process.stdin.isTTY) return;
  const { createInterface } = await import('node:readline/promises');
  const io = createInterface({ input: process.stdin, output: process.stdout });
  await io.question(`\nЗроби скриншот цього етапу. ${message} Натисни Enter, щоб продовжити...`);
  io.close();
}

export function updateEnv(updates) {
  let content = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(content)) content = content.replace(pattern, `${key}=${value}`);
    else content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=${value}\n`;
  }
  fs.writeFileSync('.env', content);
}
