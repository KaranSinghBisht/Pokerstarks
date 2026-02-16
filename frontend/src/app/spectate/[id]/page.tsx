"use client";

import dynamic from "next/dynamic";

const SpectateClientPage = dynamic(() => import("./SpectateClientPage"), {
  ssr: false,
});

export default function SpectatePage() {
  return <SpectateClientPage />;
}
