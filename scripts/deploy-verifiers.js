/**
 * Declare and deploy Garaga verifier contracts on Starknet Sepolia.
 * Uses Sierra from scarb build + CASM from starknet-sierra-compile (Cairo 2.16.0).
 */

const { RpcProvider, Account, json, hash, CallData, Contract } = require('starknet');
const fs = require('fs');

const RPC_URL = 'https://api.cartridge.gg/x/starknet/sepolia';
const PRIVATE_KEY = '0x009b2a942b12b2ece01f4f50f548904de648f7ff0da9e50676c07225e844ed9a';
const ACCOUNT_ADDRESS = '0x0311def628d901545cae8eb76dd34b8e45a3bb1ba4cd4edd7bf8675b8c3d54d4';

const VERIFIERS = [
  {
    name: 'shuffle_verifier',
    sierra: '/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/verifiers/shuffle_verifier/target/dev/shuffle_verifier_UltraKeccakZKHonkVerifier.contract_class.json',
    casm: '/tmp/verifier_casm/shuffle_verifier.compiled_contract_class.json',
  },
  {
    name: 'decrypt_verifier',
    sierra: '/Users/kryptos/Desktop/Projects/starknet/Pokerstarks/verifiers/decrypt_verifier/target/dev/decrypt_verifier_UltraKeccakZKHonkVerifier.contract_class.json',
    casm: '/tmp/verifier_casm/decrypt_verifier.compiled_contract_class.json',
  },
];

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  console.log('Account:', account.address);
  const nonce = await provider.getNonceForAddress(ACCOUNT_ADDRESS);
  console.log('Current nonce:', nonce);

  const results = {};

  for (const verifier of VERIFIERS) {
    console.log(`\n=== ${verifier.name} ===`);

    const sierraContract = JSON.parse(fs.readFileSync(verifier.sierra, 'utf8'));
    const casmContract = JSON.parse(fs.readFileSync(verifier.casm, 'utf8'));

    const classHash = hash.computeContractClassHash(sierraContract);
    const compiledClassHash = hash.computeCompiledClassHash(casmContract);

    console.log(`  Class hash: ${classHash}`);
    console.log(`  Compiled class hash: ${compiledClassHash}`);

    // Check if already declared
    let alreadyDeclared = false;
    try {
      await provider.getClassByHash(classHash);
      console.log(`  Already declared!`);
      alreadyDeclared = true;
    } catch (e) {
      // Not declared yet
    }

    if (!alreadyDeclared) {
      console.log(`  Declaring...`);
      try {
        const declareResponse = await account.declare({
          contract: sierraContract,
          casm: casmContract,
        });
        console.log(`  TX: ${declareResponse.transaction_hash}`);
        console.log(`  Waiting for confirmation...`);
        await provider.waitForTransaction(declareResponse.transaction_hash);
        console.log(`  Declared!`);
      } catch (e) {
        console.log(`  DECLARE FAILED: ${e.message?.substring(0, 300)}`);
        results[verifier.name] = { classHash, status: 'declare_failed', error: e.message?.substring(0, 300) };
        continue;
      }
      // Wait before deploying
      await new Promise(r => setTimeout(r, 3000));
    }

    // Deploy the contract (no constructor args needed for Garaga verifiers)
    console.log(`  Deploying...`);
    try {
      const deployResponse = await account.deployContract({
        classHash: classHash,
        constructorCalldata: [],
      });
      console.log(`  Deploy TX: ${deployResponse.transaction_hash}`);
      console.log(`  Contract address: ${deployResponse.contract_address}`);
      console.log(`  Waiting for confirmation...`);
      await provider.waitForTransaction(deployResponse.transaction_hash);
      console.log(`  Deployed!`);
      results[verifier.name] = {
        classHash,
        compiledClassHash,
        contractAddress: deployResponse.contract_address,
        status: 'deployed',
        tx: deployResponse.transaction_hash,
      };
    } catch (e) {
      console.log(`  DEPLOY FAILED: ${e.message?.substring(0, 300)}`);
      results[verifier.name] = { classHash, status: 'deploy_failed', error: e.message?.substring(0, 300) };
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== RESULTS ===');
  for (const [name, info] of Object.entries(results)) {
    console.log(`${name}:`);
    console.log(`  Status: ${info.status}`);
    if (info.contractAddress) console.log(`  Address: ${info.contractAddress}`);
    if (info.error) console.log(`  Error: ${info.error}`);
  }

  fs.writeFileSync('/tmp/verifier_deploy_results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to /tmp/verifier_deploy_results.json');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
