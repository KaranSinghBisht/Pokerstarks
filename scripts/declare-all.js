/**
 * Declare all Pokerstarks contracts on Starknet Sepolia.
 * Uses Sierra from sozo build + CASM from starknet-sierra-compile (Cairo 2.16.0)
 * to produce correct compiled_class_hash for Starknet 0.14.1.
 */

const { RpcProvider, Account, json, hash, CallData } = require('starknet');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.RPC_URL || 'https://api.cartridge.gg/x/starknet/sepolia';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const ACCOUNT_ADDRESS = process.env.DEPLOYER_ADDRESS;

if (!PRIVATE_KEY || !ACCOUNT_ADDRESS) {
  console.error('Error: DEPLOYER_PRIVATE_KEY and DEPLOYER_ADDRESS env vars are required.');
  console.error('Usage: DEPLOYER_PRIVATE_KEY=0x... DEPLOYER_ADDRESS=0x... node scripts/declare-all.js');
  process.exit(1);
}

const SIERRA_DIR = path.join(__dirname, '../contracts/target/sepolia');
const CASM_DIR = '/tmp/casm_output';

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  console.log('Account:', account.address);
  const nonce = await provider.getNonceForAddress(ACCOUNT_ADDRESS);
  console.log('Current nonce:', nonce);

  // Get all Sierra contract files
  const sierraFiles = fs.readdirSync(SIERRA_DIR)
    .filter(f => f.endsWith('.contract_class.json'))
    .sort();

  console.log(`\nFound ${sierraFiles.length} contracts to declare\n`);

  const results = {};

  for (const sierraFile of sierraFiles) {
    const baseName = sierraFile.replace('.contract_class.json', '');
    const casmFile = `${baseName}.compiled_contract_class.json`;

    const sierraPath = path.join(SIERRA_DIR, sierraFile);
    const casmPath = path.join(CASM_DIR, casmFile);

    if (!fs.existsSync(casmPath)) {
      console.log(`SKIP ${baseName} - no CASM file`);
      continue;
    }

    const sierraContract = JSON.parse(fs.readFileSync(sierraPath, 'utf8'));
    const casmContract = JSON.parse(fs.readFileSync(casmPath, 'utf8'));

    // Compute hashes
    const classHash = hash.computeContractClassHash(sierraContract);
    const compiledClassHash = hash.computeCompiledClassHash(casmContract);

    // Check if already declared
    try {
      await provider.getClassByHash(classHash);
      console.log(`ALREADY DECLARED: ${baseName} (${classHash})`);
      results[baseName] = { classHash, compiledClassHash, status: 'already_declared' };
      continue;
    } catch (e) {
      // Not declared yet, proceed
    }

    console.log(`Declaring ${baseName}...`);
    console.log(`  Class hash: ${classHash}`);
    console.log(`  Compiled class hash: ${compiledClassHash}`);

    try {
      const declareResponse = await account.declare({
        contract: sierraContract,
        casm: casmContract,
      });

      console.log(`  TX: ${declareResponse.transaction_hash}`);
      console.log(`  Waiting for confirmation...`);

      await provider.waitForTransaction(declareResponse.transaction_hash);
      console.log(`  DECLARED!`);
      results[baseName] = { classHash, compiledClassHash, status: 'declared', tx: declareResponse.transaction_hash };
    } catch (e) {
      console.log(`  FAILED: ${e.message?.substring(0, 200)}`);
      results[baseName] = { classHash, compiledClassHash, status: 'failed', error: e.message?.substring(0, 200) };
    }

    // Small delay between declarations
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== RESULTS ===');
  for (const [name, info] of Object.entries(results)) {
    console.log(`${info.status.padEnd(16)} ${name}: ${info.classHash}`);
  }

  // Save results
  fs.writeFileSync('/tmp/declare_results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to /tmp/declare_results.json');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
