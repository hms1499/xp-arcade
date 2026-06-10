import { NextResponse } from "next/server";
import { stacks } from "@/lib/stacks";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      network: stacks.networkName,
      contractId: `${stacks.contractAddress}.${stacks.contractName}`,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
