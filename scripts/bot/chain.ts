/**
 * Contract interaction layer for the bot.
 * Uses starknet.js Account to send transactions directly (no browser wallet).
 */

import { readFileSync } from "fs";
import { Account, RpcProvider, CallData } from "starknet";
import { log } from "./log.js";

// ───────────────────── System Addresses ─────────────────────

export interface SystemAddresses {
  lobby: string;
  game_setup: string;
  shuffle: string;
  dealing: string;
  betting: string;
  showdown: string;
  settle: string;
  timeout: string;
  egs: string;
  arena: string;
}

/**
 * Load system contract addresses from the Dojo manifest.
 * Falls back to env vars, then to hardcoded dev defaults.
 */
export function loadSystemAddresses(manifestPath?: string): SystemAddresses {
  // Try manifest first
  if (manifestPath) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const contracts = manifest.contracts ?? [];
      const find = (tag: string): string => {
        const c = contracts.find(
          (c: { tag: string }) => c.tag === `pokerstarks-${tag}`,
        );
        return c?.address ?? "";
      };
      const addrs = {
        lobby: find("lobby_system"),
        game_setup: find("game_setup_system"),
        shuffle: find("shuffle_system"),
        dealing: find("dealing_system"),
        betting: find("betting_system"),
        showdown: find("showdown_system"),
        settle: find("settle_system"),
        timeout: find("timeout_system"),
        egs: find("egs_system"),
        arena: find("arena_system"),
      };
      // Verify all found
      if (Object.values(addrs).every((a) => a)) return addrs;
    } catch {
      // Fall through
    }
  }

  // Fallback: hardcoded dev addresses (from contracts.ts)
  return {
    lobby:
      process.env.LOBBY_ADDRESS ??
      "0x5a04f9ae0a0abec7c6adfc523176ba17411a477bae2a7bff29fa93992892bdf",
    game_setup:
      process.env.GAME_SETUP_ADDRESS ??
      "0x10f3f9c62bf9122c804c7e31d6aa33539561ed6c8e561bc392f7d168109510a",
    shuffle:
      process.env.SHUFFLE_ADDRESS ??
      "0x598106c1d9d41e2546f999a15f53b80ab918e28a471392047c6066f3a931b31",
    dealing:
      process.env.DEALING_ADDRESS ??
      "0x1ae719aa58bd97bb9295e6dd2a815e5a8691f17aa7856c2b4968da8ab509c80",
    betting:
      process.env.BETTING_ADDRESS ??
      "0xe5fc0f538ae646672a51b81df1674576850c177a31dfff6ed523384416e8aa",
    showdown:
      process.env.SHOWDOWN_ADDRESS ??
      "0x67f16f003c4ec6373e846a243811b426ed335aca4650255ca91114ca420021",
    settle:
      process.env.SETTLE_ADDRESS ??
      "0x2608e1a285dbe68e8a1435f0beae53e1837e33111d98cd25ecf2bd104472fbe",
    timeout:
      process.env.TIMEOUT_ADDRESS ??
      "0x3da83ea79bca6aee6953756fc98e445bfc5727c0d16f9633374a9c785016237",
    egs:
      process.env.EGS_ADDRESS ?? "",
    arena:
      process.env.ARENA_ADDRESS ?? "",
  };
}

// ───────────────────── Bot Account ─────────────────────

export class BotChain {
  readonly account: Account;
  readonly address: string;
  readonly systems: SystemAddresses;

  constructor(rpcUrl: string, privateKey: string, accountAddress: string, systems: SystemAddresses) {
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    this.account = new Account({ provider, address: accountAddress, signer: privateKey });
    this.address = accountAddress;
    this.systems = systems;
  }

  private async execute(contract: string, entrypoint: string, calldata: (string | number | bigint)[]) {
    const result = await this.account.execute({
      contractAddress: contract,
      entrypoint,
      calldata: CallData.compile(calldata.map(String)),
    });
    log.tx(entrypoint, result.transaction_hash);
    return result;
  }

  // ─── Lobby ───
  async joinTable(tableId: number, buyIn: bigint, seatIndex: number) {
    return this.execute(this.systems.lobby, "join_table", [tableId, buyIn, seatIndex, "0"]);
  }

  async setReady(tableId: number) {
    return this.execute(this.systems.lobby, "set_ready", [tableId]);
  }

  async leaveTable(tableId: number) {
    return this.execute(this.systems.lobby, "leave_table", [tableId]);
  }

  // ─── Game Setup ───
  async startHand(tableId: number) {
    return this.execute(this.systems.game_setup, "start_hand", [tableId]);
  }

  async submitPublicKey(handId: number, pkX: string, pkY: string) {
    return this.execute(this.systems.game_setup, "submit_public_key", [handId, pkX, pkY]);
  }

  async submitAggregateKey(handId: number, aggPkX: string, aggPkY: string) {
    return this.execute(this.systems.game_setup, "submit_aggregate_key", [handId, aggPkX, aggPkY]);
  }

  async submitInitialDeckHash(handId: number, deckHash: string) {
    return this.execute(this.systems.game_setup, "submit_initial_deck_hash", [handId, deckHash]);
  }

  async submitInitialDeck(handId: number, deck: string[]) {
    return this.execute(this.systems.game_setup, "submit_initial_deck", [handId, deck.length, ...deck]);
  }

  // ─── Shuffle ───
  async submitShuffle(handId: number, newDeck: string[], proof: string[]) {
    return this.execute(this.systems.shuffle, "submit_shuffle", [
      handId, newDeck.length, ...newDeck, proof.length, ...proof,
    ]);
  }

  // ─── Dealing ───
  async submitRevealToken(
    handId: number, cardPosition: number, tokenX: string, tokenY: string, proof: string[],
  ) {
    return this.execute(this.systems.dealing, "submit_reveal_token", [
      handId, cardPosition, tokenX, tokenY, proof.length, ...proof,
    ]);
  }

  // ─── Betting ───
  async playerAction(handId: number, action: number, amount: bigint) {
    return this.execute(this.systems.betting, "player_action", [handId, action, amount]);
  }

  // ─── Showdown ───
  async submitCardDecryption(handId: number, cardPosition: number, cardId: number) {
    return this.execute(this.systems.showdown, "submit_card_decryption", [handId, cardPosition, cardId]);
  }

  async computeWinner(handId: number) {
    return this.execute(this.systems.showdown, "compute_winner", [handId]);
  }

  // ─── Settle ───
  async distributePot(handId: number) {
    return this.execute(this.systems.settle, "distribute_pot", [handId]);
  }

  // ─── Timeout ───
  async enforceTimeout(handId: number) {
    return this.execute(this.systems.timeout, "enforce_timeout", [handId]);
  }

  // ─── EGS ───
  async egsMint(tableId: number, agentName: string) {
    if (!this.systems.egs) throw new Error("EGS system address not configured");
    return this.execute(this.systems.egs, "mint", [tableId, agentName]);
  }

  async egsUpdateScore(tokenId: string, handsPlayed: number, score: number) {
    if (!this.systems.egs) throw new Error("EGS system address not configured");
    return this.execute(this.systems.egs, "update_score", [tokenId, handsPlayed, score]);
  }

  async egsCompleteSession(tokenId: string, finalScore: number) {
    if (!this.systems.egs) throw new Error("EGS system address not configured");
    return this.execute(this.systems.egs, "complete_session", [tokenId, finalScore]);
  }
}
