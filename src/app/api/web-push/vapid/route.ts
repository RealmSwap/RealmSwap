import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return NextResponse.json({ error: "VAPID_PUBLIC_KEY is not configured" }, { status: 500 });
  }

  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
}
