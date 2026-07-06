import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { SyncTask } from "@/lib/syncEngine";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { host, inviteCode, manifest, gamePath } = await req.json();

    if (!host || !inviteCode || !manifest) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const task = new SyncTask(host, inviteCode, manifest, gamePath || "");

    return NextResponse.json({ taskId: task.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
