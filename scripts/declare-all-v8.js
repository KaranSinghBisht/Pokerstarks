/**
 * Declare all Pokerstarks contracts using an existing funded account.
 * starknet.js v8 — run from scripts/ dir.
 */

const { RpcProvider, Account, hash } = require('starknet');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://api.cartridge.gg/x/starknet/sepolia';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS;

if (!PRIVATE_KEY || !DEPLOYER_ADDRESS) {
  console.error('Usage: PRIVATE_KEY=0x... DEPLOYER_ADDRESS=0x... node declare-all-v8.js');
  process.exit(1);
}

const SIERRA_DIR = path.join(__dirname, '../contracts/target/sepolia');
const CASM_DIR = '/tmp/casm_output';

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: DEPLOYER_ADDRESS, signer: PRIVATE_KEY });

  console.log('Account:', DEPLOYER_ADDRESS);
  console.log('Nonce:', await provider.getNonceForAddress(DEPLOYER_ADDRESS));

  const sierraFiles = fs.readdirSync(SIERRA_DIR)
    .filter(f => f.endsWith('.contract_class.json'))
    .sort();

  console.log(`\n${sierraFiles.length} contracts\n`);

  const results = {};
  let declared = 0, skipped = 0, failed = 0;

  for (const sierraFile of sierraFiles) {
    const baseName = sierraFile.replace('.contract_class.json', '');
    const casmPath = path.join(CASM_DIR, `${baseName}.compiled_contract_class.json`);

    if (!fs.existsSync(casmPath)) { continue; }

    const sierraContract = JSON.parse(fs.readFileSync(path.join(SIERRA_DIR, sierraFile), 'utf8'));
    const casmContract = JSON.parse(fs.readFileSync(casmPath, 'utf8'));
    const classHash = hash.computeContractClassHash(sierraContract);
    const compiledClassHash = hash.computeCompiledClassHash(casmContract);

    try {
      await provider.getClassByHash(classHash);
      console.log(`SKIP: ${baseName}`);
      results[baseName] = { classHash, compiledClassHash, status: 'already_declared' };
      skipped++;
      continue;
    } catch {}

    console.log(`Declaring ${baseName}...`);

    let success = false;
    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        if (attempt > 1) console.log(`  retry ${attempt}...`);
        const resp = await account.declare({ contract: sierraContract, casm: casmContract });
        console.log(`  TX: ${resp.transaction_hash}`);
        await provider.waitForTransaction(resp.transaction_hash);
        console.log(`  OK`);
        results[baseName] = { classHash, compiledClassHash, status: 'declared', tx: resp.transaction_hash };
        declared++;
        success = true;
      } catch (e) {
        const msg = e.message || '';
        // Extract just the error reason, not the huge sierra dump
        const valIdx = msg.indexOf('Account validation');
        const panickIdx = msg.indexOf('panicked with');
        let shortErr;
        if (panickIdx >= 0) shortErr = msg.substring(panickIdx, panickIdx + 200);
        else if (valIdx >= 0) shortErr = msg.substring(valIdx, valIdx + 200);
        else shortErr = msg.substring(Math.max(0, msg.length - 300));

        console.log(`  FAIL(${attempt}): ${shortErr}`);
        if (attempt === 3) {
          results[baseName] = { classHash, compiledClassHash, status: 'failed', error: shortErr };
          failed++;
        } else {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n=== ${declared} declared, ${skipped} already, ${failed} failed ===\n`);
  for (const [name, info] of Object.entries(results)) {
    console.log(`${info.status.padEnd(18)} ${name}: ${info.classHash}`);
  }
  fs.writeFileSync('/tmp/declare_results.json', JSON.stringify(results, null, 2));
}

main().catch(e => {
  console.error('Fatal:', (e.message || '').substring(Math.max(0, (e.message?.length || 0) - 500)));
  process.exit(1);
});
