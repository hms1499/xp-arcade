import { NextResponse } from "next/server";
import { getLeaderboardSnapshot } from "@/lib/leaderboard-cache";

// Run at request time so the in-memory snapshot cache + CDN s-maxage drive
// caching (matches app/api/health/route.ts), rather than build-time prerender.
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getLeaderboardSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
