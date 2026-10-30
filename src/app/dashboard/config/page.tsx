import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import ConfigEditorView from "@/components/ConfigEditorView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Server Config",
};

export default async function ConfigPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  return <ConfigEditorView user={user} />;
}
