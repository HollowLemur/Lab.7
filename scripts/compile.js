import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const file = 'AutoCompoundVault.sol';
const input = {
  language: 'Solidity',
  sources: { [file]: { content: fs.readFileSync(path.join('contracts', file), 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input), {
  import(name) {
    const resolved = path.join('node_modules', name);
    return fs.existsSync(resolved) ? { contents: fs.readFileSync(resolved, 'utf8') } : { error: `Missing import: ${name}` };
  }
}));
for (const error of output.errors || []) console.log(error.formattedMessage);
if (output.errors?.some(error => error.severity === 'error')) process.exit(1);

const contract = output.contracts[file].AutoCompoundVault;
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/AutoCompoundVault.json', JSON.stringify({
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`
}, null, 2));
fs.writeFileSync('artifacts/compilation.json', JSON.stringify({ compiler: solc.version(), success: true }, null, 2));
console.log(`Compiled AutoCompoundVault with ${solc.version()}`);
