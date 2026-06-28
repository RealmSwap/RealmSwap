import { NextResponse } from "next/server";
import fs from "fs";
import { getAuthenticatedUser } from "@/lib/auth";
import { dataRoot } from "@/lib/appPaths";
import { storageLocationPaths } from "@/lib/storageLocations";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const root = dataRoot();
    const locations = storageLocationPaths(root).map((loc) => ({
      key: loc.key,
      label: loc.label,
      path: loc.path,
      exists: fs.existsSync(loc.path),
    }));

    return NextResponse.json({ dataRoot: root, locations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
