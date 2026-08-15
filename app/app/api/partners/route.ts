import { NextResponse } from "next/server";
import { PARTNERS, partnerCoverage } from "../../../lib/content";

// Static content layer only. The directory read path must never depend on a
// database at runtime — venue wifi and an Atlas outage cannot be allowed to
// take it down.
export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    partners: PARTNERS,
    dataSource: "static",
    count: PARTNERS.length,
    coverage: partnerCoverage(),
  });
}
