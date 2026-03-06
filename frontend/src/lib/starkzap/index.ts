import { StarkZap } from "starkzap";

let instance: StarkZap | null = null;

export function getStarkZap(): StarkZap {
  if (!instance) {
    instance = new StarkZap({ network: "sepolia" });
  }
  return instance;
}
