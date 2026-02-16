"use client";

import dynamic from "next/dynamic";

const TableClientPage = dynamic(() => import("./TableClientPage"), {
  ssr: false,
});

export default function TablePage() {
  return <TableClientPage />;
}
