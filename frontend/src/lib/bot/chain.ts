/**
 * Contract interaction layer for server-side bots.
 * Port of scripts/bot/chain.ts — uses starknet.js Account directly.
 */

import { Account, RpcProvider, CallData } from "starknet";
import { log } from "./log";
import { SYSTEM_CONTRACTS } from "@/lib/contracts";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.NEXT_PUBLIC_TORII_RPC_URL ||
  "http://localhost:5050";

export class BotChain {
  readonly account: Account;
  readonly address: string;

  constructor(privateKey: string, accountAddress: string) {
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    this.account = new Account({
      provider,
      address: accountAddress,
      signer: privateKey,
    });
    this.address = accountAddress;
  }

  private async execute(
    system: keyof typeof SYSTEM_CONTRACTS,
    entrypoint: string,
    calldata: (string | number | bigint)[],
  ) {
    const contractAddress = SYSTEM_CONTRACTS[system];
    if (!contractAddress) {
      throw new Error(`Missing contract address for system: ${system}`);
    }
    const result = await this.account.execute({
      contractAddress,
      entrypoint,
      calldata: CallData.compile(calldata.map(String)),
    });
    log.tx(entrypoint, result.transaction_hash);
    return result;
  }

  // ─── Lobby ───
  async joinTable(tableId: number, buyIn: bigint, seatIndex: number) {
    return this.execute("lobby", "join_table", [
      tableId,
      buyIn,
      seatIndex,
      "0",
    ]);
  }

  /** Approve ERC20 token + join table in a single multicall */
  async approveAndJoinTable(
    tableId: number,
    buyIn: bigint,
    seatIndex: number,
    tokenAddress: string,
  ) {
    const lobbyAddress = SYSTEM_CONTRACTS.lobby;
    if (!lobbyAddress) {
      throw new Error("Missing contract address for system: lobby");
    }
    const result = await this.account.execute([
      {
        contractAddress: tokenAddress,
        entrypoint: "approve",
        calldata: CallData.compile([lobbyAddress, buyIn, 0].map(String)),
      },
      {
        contractAddress: lobbyAddress,
        entrypoint: "join_table",
        calldata: CallData.compile([tableId, buyIn, seatIndex, "0"].map(String)),
      },
    ]);
    log.tx("approve+join_table", result.transaction_hash);
    return result;
  }

  async setReady(tableId: number) {
    return this.execute("lobby", "set_ready", [tableId]);
  }

  async leaveTable(tableId: number) {
    return this.execute("lobby", "leave_table", [tableId]);
  }

  // ─── Game Setup ───
  async startHand(tableId: number) {
    return this.execute("game_setup", "start_hand", [tableId]);
  }

  async submitPublicKey(handId: number, pkX: string, pkY: string) {
    return this.execute("game_setup", "submit_public_key", [
      handId,
      pkX,
      pkY,
    ]);
  }

  async submitAggregateKey(handId: number, aggPkX: string, aggPkY: string) {
    return this.execute("game_setup", "submit_aggregate_key", [
      handId,
      aggPkX,
      aggPkY,
    ]);
  }

  async submitInitialDeckHash(handId: number, deckHash: string) {
    return this.execute("game_setup", "submit_initial_deck_hash", [
      handId,
      deckHash,
    ]);
  }

  async submitInitialDeck(handId: number, deck: string[]) {
    return this.execute("game_setup", "submit_initial_deck", [
      handId,
      deck.length,
      ...deck,
    ]);
  }

  // ─── Shuffle ───
  async submitShuffle(handId: number, newDeck: string[], proof: string[]) {
    return this.execute("shuffle", "submit_shuffle", [
      handId,
      newDeck.length,
      ...newDeck,
      proof.length,
      ...proof,
    ]);
  }

  // ─── Dealing ───
  async submitRevealToken(
    handId: number,
    cardPosition: number,
    tokenX: string,
    tokenY: string,
    proof: string[],
  ) {
    return this.execute("dealing", "submit_reveal_token", [
      handId,
      cardPosition,
      tokenX,
      tokenY,
      proof.length,
      ...proof,
    ]);
  }

  // ─── Betting ───
  async playerAction(handId: number, action: number, amount: bigint) {
    return this.execute("betting", "player_action", [handId, action, amount]);
  }

  // ─── Showdown ───
  async submitCardDecryption(
    handId: number,
    cardPosition: number,
    cardId: number,
  ) {
    return this.execute("showdown", "submit_card_decryption", [
      handId,
      cardPosition,
      cardId,
    ]);
  }

  async computeWinner(handId: number) {
    return this.execute("showdown", "compute_winner", [handId]);
  }

  // ─── Settle ───
  async distributePot(handId: number) {
    return this.execute("settle", "distribute_pot", [handId]);
  }

  // ─── Timeout ───
  async enforceTimeout(handId: number) {
    return this.execute("timeout", "enforce_timeout", [handId]);
  }
}
