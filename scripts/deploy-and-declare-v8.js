/**
 * Deploy OZ account + declare all contracts using starknet.js v8.
 * Run from scripts/ dir (uses symlinked node_modules from frontend/).
 */

const { RpcProvider, Account, hash, ec, CallData } = require('starknet');
const fs = require('fs');
const path = require('path');

const OZ_ACCOUNT_CLASS_HASH = '0x5b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564';
const RPC_URL = 'https://api.cartridge.gg/x/starknet/sepolia';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS;

if (!PRIVATE_KEY || !DEPLOYER_ADDRESS) {
  console.error('Usage: PRIVATE_KEY=0x... DEPLOYER_ADDRESS=0x... node deploy-and-declare-v8.js');
  process.exit(1);
}

const SIERRA_DIR = path.join(__dirname, '../contracts/target/sepolia');
const CASM_DIR = '/tmp/casm_output';

async function deployAccount(provider) {
  const publicKey = ec.starkCurve.getStarkKey(PRIVATE_KEY);
  console.log('Public key:', publicKey);
  console.log('Address:', DEPLOYER_ADDRESS);

  // Check if already deployed
  try {
    await provider.getClassHashAt(DEPLOYER_ADDRESS);
    console.log('Account already deployed');
    return new Account({ provider, address: DEPLOYER_ADDRESS, signer: PRIVATE_KEY });
  } catch {
    // Not deployed
  }

  console.log('Deploying OZ account...');
  const account = new Account({ provider, address: DEPLOYER_ADDRESS, signer: PRIVATE_KEY });

  const deployPayload = {
    classHash: OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata: CallData.compile({ public_key: publicKey }),
    addressSalt: publicKey,
  };

  const { transaction_hash, contract_address } = await account.deployAccount(deployPayload);
  console.log('Deploy TX:', transaction_hash);
  await provider.waitForTransaction(transaction_hash);
  console.log('Account deployed at:', contract_address);

  return new Account({ provider, address: contract_address, signer: PRIVATE_KEY });
}

async function declareAll(account, provider) {
  const sierraFiles = fs.readdirSync(SIERRA_DIR)
    .filter(f => f.endsWith('.contract_class.json'))
    .sort();

  console.log(`\n${sierraFiles.length} contracts to declare\n`);

  const results = {};
  let declared = 0, skipped = 0, failed = 0;

  for (const sierraFile of sierraFiles) {
    const baseName = sierraFile.replace('.contract_class.json', '');
    const casmPath = path.join(CASM_DIR, `${baseName}.compiled_contract_class.json`);

    if (!fs.existsSync(casmPath)) {
      console.log(`SKIP ${baseName} - no CASM`);
      continue;
    }

    const sierraContract = JSON.parse(fs.readFileSync(path.join(SIERRA_DIR, sierraFile), 'utf8'));
    const casmContract = JSON.parse(fs.readFileSync(casmPath, 'utf8'));
    const classHash = hash.computeContractClassHash(sierraContract);
    const compiledClassHash = hash.computeCompiledClassHash(casmContract);

    try {
      await provider.getClassByHash(classHash);
      console.log(`SKIP (declared): ${baseName}`);
      results[baseName] = { classHash, compiledClassHash, status: 'already_declared' };
      skipped++;
      continue;
    } catch {}

    console.log(`Declaring ${baseName}...`);

    let success = false;
    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        if (attempt > 1) console.log(`  Retry ${attempt}/3...`);
        const resp = await account.declare({ contract: sierraContract, casm: casmContract });
        console.log(`  TX: ${resp.transaction_hash}`);
        await provider.waitForTransaction(resp.transaction_hash);
        console.log(`  OK!`);
        results[baseName] = { classHash, compiledClassHash, status: 'declared', tx: resp.transaction_hash };
        declared++;
        success = true;
      } catch (e) {
        const msg = e.message || '';
        const valIdx = msg.indexOf('Account validation');
        const last = msg.substring(Math.max(0, msg.length - 400));
        const shortErr = valIdx >= 0 ? msg.substring(valIdx, valIdx + 300) : last;
        console.log(`  FAIL (${attempt}): ${shortErr}`);
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

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = await deployAccount(provider);
  await declareAll(account, provider);
}

main().catch(e => {
  const msg = e.message || '';
  console.error('Fatal:', msg.substring(Math.max(0, msg.length - 500)));
  process.exit(1);
});
