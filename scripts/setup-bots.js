#!/usr/bin/env node
/**
 * Generate and deploy bot accounts on Starknet Sepolia.
 *
 * Creates 4 bot accounts using OpenZeppelin Account contract,
 * deploys them, funds them with STRK from the deployer account,
 * and writes the credentials to frontend/.env.local.
 *
 * Usage:
 *   node scripts/setup-bots.js
 *
 * Requires:
 *   starknet.js (resolved from frontend/node_modules)
 */

const fs = require("fs");
const path = require("path");

// Resolve starknet from frontend/node_modules
const frontendModules = path.join(__dirname, "..", "frontend", "node_modules");
const {
  RpcProvider,
  Account,
  ec,
  hash,
  stark,
  CallData,
} = require(require.resolve("starknet", { paths: [frontendModules] }));

// ─── Config ───

const RPC_URL = process.env.RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";

// Deployer account (funds the bots) — read from env vars, never commit keys
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS;

if (!DEPLOYER_PRIVATE_KEY || !DEPLOYER_ADDRESS) {
  console.error("Error: DEPLOYER_PRIVATE_KEY and DEPLOYER_ADDRESS env vars are required.");
  console.error("Usage: DEPLOYER_PRIVATE_KEY=0x... DEPLOYER_ADDRESS=0x... node scripts/setup-bots.js");
  process.exit(1);
}

// OpenZeppelin Account class hash on Sepolia
// This is the standard OZ Account v0.14.0 class hash
const OZ_ACCOUNT_CLASS_HASH =
  "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f";

// STRK token on Starknet Sepolia (used for gas on Sepolia 0.13.2+)
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Amount of STRK to send to each bot (5 STRK — enough for many txs)
const FUND_AMOUNT = 5000000000000000000n; // 5 STRK (18 decimals)

const NUM_BOTS = 4;
const ENV_LOCAL_PATH = path.join(__dirname, "..", "frontend", ".env.local");

// ─── Helpers ───

function generateBotKeypair() {
  const privateKey = stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  return { privateKey, publicKey };
}

function computeAccountAddress(publicKey, salt) {
  return hash.calculateContractAddressFromHash(
    salt,
    OZ_ACCOUNT_CLASS_HASH,
    CallData.compile({ public_key: publicKey }),
    0,
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ───

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const deployer = new Account({
    provider,
    address: DEPLOYER_ADDRESS,
    signer: DEPLOYER_PRIVATE_KEY,
  });

  console.log("Deployer:", DEPLOYER_ADDRESS);

  // Check deployer STRK balance
  const strkBalance = await provider.callContract({
    contractAddress: STRK_ADDRESS,
    entrypoint: "balanceOf",
    calldata: CallData.compile({ account: DEPLOYER_ADDRESS }),
  });
  const balanceWei = BigInt(strkBalance[0]);
  const balanceStrk = Number(balanceWei) / 1e18;
  console.log(`Deployer STRK balance: ${balanceStrk.toFixed(4)} STRK`);

  const totalNeeded = FUND_AMOUNT * BigInt(NUM_BOTS);
  if (balanceWei < totalNeeded) {
    console.error(
      `\nInsufficient STRK. Need ${Number(totalNeeded) / 1e18} STRK for ${NUM_BOTS} bots.`,
    );
    console.error(
      "Fund the deployer at https://starknet-faucet.vercel.app/ or https://faucet.sepolia.starknet.io/",
    );
    process.exit(1);
  }

  // Generate keypairs
  console.log(`\nGenerating ${NUM_BOTS} bot keypairs...\n`);
  const bots = [];
  for (let i = 0; i < NUM_BOTS; i++) {
    const { privateKey, publicKey } = generateBotKeypair();
    const salt = publicKey; // Use pubkey as salt (standard practice)
    const address = computeAccountAddress(publicKey, salt);
    bots.push({ privateKey, publicKey, salt, address, index: i + 1 });
    console.log(`Bot ${i + 1}:`);
    console.log(`  Private key: ${privateKey}`);
    console.log(`  Public key:  ${publicKey}`);
    console.log(`  Address:     ${address}`);
  }

  // Fund all bot addresses with STRK (pre-fund so deploy_account works)
  console.log("\nFunding bot addresses with STRK...");
  const transferCalls = bots.map((bot) => ({
    contractAddress: STRK_ADDRESS,
    entrypoint: "transfer",
    calldata: CallData.compile({
      recipient: bot.address,
      amount: { low: FUND_AMOUNT.toString(), high: "0" },
    }),
  }));

  const fundTx = await deployer.execute(transferCalls);
  console.log(`Fund TX: ${fundTx.transaction_hash}`);
  console.log("Waiting for confirmation...");
  await provider.waitForTransaction(fundTx.transaction_hash);
  console.log("All bots funded with STRK!");

  // Deploy each bot account
  console.log("\nDeploying bot accounts...\n");
  for (const bot of bots) {
    console.log(`Deploying Bot ${bot.index} (${bot.address})...`);

    const botAccount = new Account({
      provider,
      address: bot.address,
      signer: bot.privateKey,
    });

    try {
      const deployTx = await botAccount.deployAccount({
        classHash: OZ_ACCOUNT_CLASS_HASH,
        constructorCalldata: CallData.compile({ public_key: bot.publicKey }),
        addressSalt: bot.salt,
      });

      console.log(`  Deploy TX: ${deployTx.transaction_hash}`);
      await provider.waitForTransaction(deployTx.transaction_hash);
      console.log(`  Deployed!`);
    } catch (err) {
      // Account might already be deployed
      if (
        err.message?.includes("already declared") ||
        err.message?.includes("TRANSACTION_RECEIVED")
      ) {
        console.log(`  Already deployed or pending.`);
      } else {
        console.error(`  Deploy failed: ${err.message}`);
        console.error(`  Bot ${bot.index} may need manual deployment.`);
      }
    }

    await sleep(2000); // Rate limit
  }

  // Write to .env.local
  console.log("\nUpdating frontend/.env.local...");

  if (!fs.existsSync(ENV_LOCAL_PATH)) {
    console.error(`  ${ENV_LOCAL_PATH} not found. Creating from .env.example.`);
    const examplePath = path.join(__dirname, "..", "frontend", ".env.example");
    fs.copyFileSync(examplePath, ENV_LOCAL_PATH);
  }

  let envContent = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");

  for (const bot of bots) {
    const pkKey = `BOT_PRIVATE_KEY_${bot.index}`;
    const addrKey = `BOT_ADDRESS_${bot.index}`;

    // Update existing lines or append
    if (envContent.match(new RegExp(`^${pkKey}=`, "m"))) {
      envContent = envContent.replace(
        new RegExp(`^${pkKey}=.*$`, "m"),
        `${pkKey}=${bot.privateKey}`,
      );
    } else {
      envContent += `\n${pkKey}=${bot.privateKey}`;
    }

    if (envContent.match(new RegExp(`^${addrKey}=`, "m"))) {
      envContent = envContent.replace(
        new RegExp(`^${addrKey}=.*$`, "m"),
        `${addrKey}=${bot.address}`,
      );
    } else {
      envContent += `\n${addrKey}=${bot.address}`;
    }
  }

  fs.writeFileSync(ENV_LOCAL_PATH, envContent);
  console.log("  Bot credentials written to .env.local");

  // Summary
  console.log("\n═══════════════════════════════════════════");
  console.log("  Bot Setup Complete!");
  console.log("═══════════════════════════════════════════\n");
  for (const bot of bots) {
    console.log(`  Bot ${bot.index}: ${bot.address}`);
  }
  console.log(
    `\n  Each funded with ${Number(FUND_AMOUNT) / 1e18} STRK for gas.`,
  );
  console.log("  Credentials saved to frontend/.env.local\n");

  // Save full details to a JSON file for reference
  const outputPath = path.join(__dirname, "..", "bot-accounts.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      bots.map((b) => ({
        index: b.index,
        privateKey: b.privateKey,
        publicKey: b.publicKey,
        address: b.address,
      })),
      null,
      2,
    ),
  );
  console.log(`  Full details saved to bot-accounts.json`);
}

main().catch((e) => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
