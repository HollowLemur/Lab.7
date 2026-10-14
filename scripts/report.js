import fs from 'node:fs';
const result = JSON.parse(fs.readFileSync('results/run.json', 'utf8'));
console.log(`Network: ${result.network}`);
console.log(`Wallet: ${result.wallet}`);
console.log(`Result: ${result.passed ? 'PASS' : 'FAIL'}`);
for (const stage of result.stages || []) {
  console.log(`\n${stage.name}`);
  for (const [key, value] of Object.entries(stage)) if (key !== 'name') console.log(`  ${key}: ${value}`);
}
if (!result.passed) process.exitCode = 1;
