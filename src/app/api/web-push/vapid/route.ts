import { NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/vapidKeys";

export async function GET() {
  // Env keys win; otherwise the auto-provisioned key file. Either way the
  // browser gets the public key it needs to subscribe.
  try {
    return NextResponse.json({ publicKey: getVapidKeys().publicKey });
  } catch (err) {
    console.error("GET /api/web-push/vapid error:", err);
    return NextResponse.json({ error: "Failed to provision VAPID keys" }, { status: 500 });
  }
}
