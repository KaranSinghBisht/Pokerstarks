/**
 * Deploy the CHIP token (ERC20, decimals=0) to Starknet Sepolia.
 *
 * Steps:
 * 1. Compile Sierra → CASM via Cairo 2.16.0 starknet-sierra-compile
 * 2. Declare the class on Sepolia via starknet.js
 * 3. Deploy via UDC (or deployContract)
 * 4. Mint 100,000 CHIP to each of the 4 bot accounts
 * 5. Write address to chip-token-address.json and append to frontend/.env.local
 *
 * Usage: node scripts/deploy-chip-token.js
 */

const { RpcProvider, Account, json, hash, CallData, stark } = require('starknet');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RPC_URL = process.env.RPC_URL || 'https://api.cartridge.gg/x/starknet/sepolia';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const ACCOUNT_ADDRESS = process.env.DEPLOYER_ADDRESS;

if (!PRIVATE_KEY || !ACCOUNT_ADDRESS) {
  console.error('Error: DEPLOYER_PRIVATE_KEY and DEPLOYER_ADDRESS env vars are required.');
  console.error('Usage: DEPLOYER_PRIVATE_KEY=0x... DEPLOYER_ADDRESS=0x... node scripts/deploy-chip-token.js');
  process.exit(1);
}

// Bot accounts from env vars (BOT_ADDRESS_1..4) or BOT_ADDRESSES (comma-separated)
function loadBotAccounts() {
  if (process.env.BOT_ADDRESSES) {
    return process.env.BOT_ADDRESSES.split(',').map(a => a.trim()).filter(Boolean);
  }
  const accounts = [];
  for (let i = 1; i <= 4; i++) {
    const addr = process.env[`BOT_ADDRESS_${i}`];
    if (addr) accounts.push(addr);
  }
  if (accounts.length === 0) {
    console.warn('Warning: No BOT_ADDRESS_* or BOT_ADDRESSES env vars set. Skipping bot minting.');
  }
  return accounts;
}
const BOT_ACCOUNTS = loadBotAccounts();

const BOT_MINT_AMOUNT = 100_000; // 100k CHIP each

const CHIP_TOKEN_DIR = path.join(__dirname, '../chip-token');
const SIERRA_PATH = path.join(CHIP_TOKEN_DIR, 'target/dev/chip_token_ChipToken.contract_class.json');
const CASM_OUTPUT_DIR = '/tmp/casm_output';

// Cairo 2.16.0 compiler (same as used for verifiers + dojo contracts)
const SIERRA_COMPILE = '/tmp/cairo-compiler/cairo/bin/starknet-sierra-compile';

async function main() {
  console.log('=== CHIP Token Deployment ===\n');

  // Step 0: Build with scarb
  console.log('Building chip-token...');
  execSync('scarb build', { cwd: CHIP_TOKEN_DIR, stdio: 'inherit' });

  if (!fs.existsSync(SIERRA_PATH)) {
    throw new Error(`Sierra file not found: ${SIERRA_PATH}`);
  }

  // Step 1: Compile Sierra → CASM
  console.log('\nCompiling Sierra → CASM...');
  fs.mkdirSync(CASM_OUTPUT_DIR, { recursive: true });
  const casmPath = path.join(CASM_OUTPUT_DIR, 'chip_token_ChipToken.compiled_contract_class.json');

  if (fs.existsSync(SIERRA_COMPILE)) {
    execSync(`${SIERRA_COMPILE} --allowed-libfuncs-list-name all "${SIERRA_PATH}" "${casmPath}"`, {
      stdio: 'inherit',
    });
  } else {
    console.log('Cairo 2.16.0 compiler not found at', SIERRA_COMPILE);
    console.log('Falling back to scarb-built CASM (may fail on Sepolia v0.14.1)...');
    // Copy the scarb-generated CASM if available
    const scarbCasm = SIERRA_PATH.replace('.contract_class.json', '.compiled_contract_class.json');
    if (fs.existsSync(scarbCasm)) {
      fs.copyFileSync(scarbCasm, casmPath);
    } else {
      throw new Error('No CASM file available. Install Cairo 2.16.0 compiler.');
    }
  }

  // Step 2: Declare on Sepolia
  console.log('\nDeclaring on Sepolia...');
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  const sierraContract = JSON.parse(fs.readFileSync(SIERRA_PATH, 'utf8'));
  const casmContract = JSON.parse(fs.readFileSync(casmPath, 'utf8'));

  const classHash = hash.computeContractClassHash(sierraContract);
  const compiledClassHash = hash.computeCompiledClassHash(casmContract);
  console.log('  Class hash:', classHash);
  console.log('  Compiled class hash:', compiledClassHash);

  // Check if already declared
  let alreadyDeclared = false;
  try {
    await provider.getClassByHash(classHash);
    console.log('  Already declared!');
    alreadyDeclared = true;
  } catch {
    // Not declared yet
  }

  if (!alreadyDeclared) {
    const declareResponse = await account.declare({
      contract: sierraContract,
      casm: casmContract,
    });
    console.log('  TX:', declareResponse.transaction_hash);
    console.log('  Waiting for confirmation...');
    await provider.waitForTransaction(declareResponse.transaction_hash);
    console.log('  Declared!');
    // Wait for nonce sync
    await new Promise(r => setTimeout(r, 3000));
  }

  // Step 3: Deploy
  console.log('\nDeploying CHIP token...');
  const constructorCalldata = CallData.compile([ACCOUNT_ADDRESS]); // owner = deployer

  const deployResponse = await account.deploy({
    classHash,
    constructorCalldata,
  });
  console.log('  TX:', deployResponse.transaction_hash);
  console.log('  Waiting for confirmation...');
  await provider.waitForTransaction(deployResponse.transaction_hash);

  const chipAddress = deployResponse.contract_address[0] || deployResponse.contract_address;
  console.log('  CHIP Token deployed at:', chipAddress);

  // Wait for nonce sync
  await new Promise(r => setTimeout(r, 3000));

  // Step 4: Mint to bot accounts
  console.log('\nMinting to bot accounts...');
  for (const botAddr of BOT_ACCOUNTS) {
    console.log(`  Minting ${BOT_MINT_AMOUNT} CHIP to ${botAddr.slice(0, 18)}...`);
    const tx = await account.execute({
      contractAddress: chipAddress,
      entrypoint: 'transfer',
      calldata: CallData.compile([botAddr, BOT_MINT_AMOUNT, 0]), // u256 = (low, high)
    });
    console.log(`    TX: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Step 5: Save results
  const result = {
    classHash,
    compiledClassHash,
    address: chipAddress,
    deployer: ACCOUNT_ADDRESS,
    botMintAmount: BOT_MINT_AMOUNT,
    bots: BOT_ACCOUNTS,
    timestamp: new Date().toISOString(),
  };

  const resultPath = path.join(__dirname, '../chip-token-address.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`\nResults saved to ${resultPath}`);

  // Append to frontend/.env.local
  const envPath = path.join(__dirname, '../frontend/.env.local');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('NEXT_PUBLIC_CHIP_TOKEN_ADDRESS')) {
      // Replace existing
      envContent = envContent.replace(
        /NEXT_PUBLIC_CHIP_TOKEN_ADDRESS=.*/,
        `NEXT_PUBLIC_CHIP_TOKEN_ADDRESS=${chipAddress}`,
      );
    } else {
      // Append
      envContent += `\n# CHIP Token (ERC20, decimals=0)\nNEXT_PUBLIC_CHIP_TOKEN_ADDRESS=${chipAddress}\n`;
    }
    fs.writeFileSync(envPath, envContent);
    console.log('Updated frontend/.env.local');
  }

  console.log('\nNote: Set CHIP_DEPLOYER_PRIVATE_KEY and CHIP_DEPLOYER_ADDRESS in frontend/.env.local for the faucet API.');
  console.log('\n=== Done! ===');
  console.log('CHIP Token Address:', chipAddress);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
