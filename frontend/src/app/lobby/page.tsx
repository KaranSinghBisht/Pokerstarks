"use client";

import dynamic from "next/dynamic";

const LobbyClientPage = dynamic(() => import("./LobbyClientPage"), {
  ssr: false,
});

export default function LobbyPage() {
  return <LobbyClientPage />;
}
