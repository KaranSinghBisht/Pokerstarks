"use client";

import { type ReactNode } from "react";
import { DenshokanProvider as Provider } from "@provable-games/denshokan-sdk/react";

const DENSHOKAN_ADDRESS =
  process.env.NEXT_PUBLIC_DENSHOKAN_ADDRESS ||
  "0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467";
const REGISTRY_ADDRESS =
  process.env.NEXT_PUBLIC_DENSHOKAN_REGISTRY_ADDRESS ||
  "0x040f1ed9880611bb7273bf51fd67123ebbba04c282036e2f81314061f6f9b1a1";
const VIEWER_ADDRESS =
  process.env.NEXT_PUBLIC_DENSHOKAN_VIEWER_ADDRESS ||
  "0x025d92f18c6c1ed2114774adf68249a95fc468d9381ab33fa4b9ccfff7cf5f9f";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://api.cartridge.gg/x/starknet/sepolia";

export function DenshokanWrapper({ children }: { children: ReactNode }) {
  return (
    <Provider
      config={{
        chain: "sepolia",
        rpcUrl: RPC_URL,
        denshokanAddress: DENSHOKAN_ADDRESS,
        registryAddress: REGISTRY_ADDRESS,
        viewerAddress: VIEWER_ADDRESS,
        primarySource: "rpc",
      }}
    >
      {children}
    </Provider>
  );
}
