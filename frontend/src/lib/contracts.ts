export type SystemContract =
  | "lobby"
  | "game_setup"
  | "shuffle"
  | "dealing"
  | "betting"
  | "showdown"
  | "settle"
  | "timeout"
  | "chat";

// Local development fallbacks from contracts/manifest_dev.json.
// Production should always provide explicit NEXT_PUBLIC_* addresses.
const DEV_FALLBACK: Record<SystemContract, string> = {
  lobby: "0x5a04f9ae0a0abec7c6adfc523176ba17411a477bae2a7bff29fa93992892bdf",
  game_setup: "0x10f3f9c62bf9122c804c7e31d6aa33539561ed6c8e561bc392f7d168109510a",
  shuffle: "0x598106c1d9d41e2546f999a15f53b80ab918e28a471392047c6066f3a931b31",
  dealing: "0x1ae719aa58bd97bb9295e6dd2a815e5a8691f17aa7856c2b4968da8ab509c80",
  betting: "0xe5fc0f538ae646672a51b81df1674576850c177a31dfff6ed523384416e8aa",
  showdown: "0x67f16f003c4ec6373e846a243811b426ed335aca4650255ca91114ca420021",
  settle: "0x2608e1a285dbe68e8a1435f0beae53e1837e33111d98cd25ecf2bd104472fbe",
  timeout: "0x3da83ea79bca6aee6953756fc98e445bfc5727c0d16f9633374a9c785016237",
  chat: "0x1c3fa28dc400a60080f713778749c778ed24f683df859f369c365f2ef9c2569",
};

const ENV_VALUES: Record<SystemContract, string> = {
  lobby: process.env.NEXT_PUBLIC_LOBBY_ADDRESS || "",
  game_setup: process.env.NEXT_PUBLIC_GAME_SETUP_ADDRESS || "",
  shuffle: process.env.NEXT_PUBLIC_SHUFFLE_ADDRESS || "",
  dealing: process.env.NEXT_PUBLIC_DEALING_ADDRESS || "",
  betting: process.env.NEXT_PUBLIC_BETTING_ADDRESS || "",
  showdown: process.env.NEXT_PUBLIC_SHOWDOWN_ADDRESS || "",
  settle: process.env.NEXT_PUBLIC_SETTLE_ADDRESS || "",
  timeout: process.env.NEXT_PUBLIC_TIMEOUT_ADDRESS || "",
  chat: process.env.NEXT_PUBLIC_CHAT_ADDRESS || "",
};

const allowFallback = process.env.NODE_ENV !== "production";

export const SYSTEM_CONTRACTS: Record<SystemContract, string> = {
  lobby: ENV_VALUES.lobby || (allowFallback ? DEV_FALLBACK.lobby : ""),
  game_setup: ENV_VALUES.game_setup || (allowFallback ? DEV_FALLBACK.game_setup : ""),
  shuffle: ENV_VALUES.shuffle || (allowFallback ? DEV_FALLBACK.shuffle : ""),
  dealing: ENV_VALUES.dealing || (allowFallback ? DEV_FALLBACK.dealing : ""),
  betting: ENV_VALUES.betting || (allowFallback ? DEV_FALLBACK.betting : ""),
  showdown: ENV_VALUES.showdown || (allowFallback ? DEV_FALLBACK.showdown : ""),
  settle: ENV_VALUES.settle || (allowFallback ? DEV_FALLBACK.settle : ""),
  timeout: ENV_VALUES.timeout || (allowFallback ? DEV_FALLBACK.timeout : ""),
  chat: ENV_VALUES.chat || (allowFallback ? DEV_FALLBACK.chat : ""),
};

export function getSystemAddress(contract: SystemContract): string {
  return SYSTEM_CONTRACTS[contract];
}

export function missingSystemAddresses(
  contracts: SystemContract[],
): SystemContract[] {
  return contracts.filter((c) => !getSystemAddress(c));
}
