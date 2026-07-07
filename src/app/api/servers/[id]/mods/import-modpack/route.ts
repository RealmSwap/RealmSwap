import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyServerAccess } from "@/lib/serverAuth";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { dataRoot } from "@/lib/appPaths";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const serverId = params.id;
    const access = await verifyServerAccess(serverId, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("modpack") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "No modpack file provided" }, { status: 400 });
    }

    // Save the file to a temp location
    const tempDir = path.join(dataRoot(), "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const tempPath = path.join(tempDir, `${Date.now()}_${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);

    try {
      // Mock Modpack Parsing Logic
      const zip = new AdmZip(tempPath);
      const entries = zip.getEntries();
      
      // Look for a manifest.json or something similar
      const manifestEntry = entries.find(e => e.entryName === "manifest.json");
      
      let message = "Modpack processed and overrides extracted successfully!";
      
      if (manifestEntry) {
        // Read manifest to get mods
        const manifestData = JSON.parse(manifestEntry.getData().toString("utf8"));
        console.log("Found manifest for modpack:", manifestData.name);
        message = `Successfully imported modpack '${manifestData.name}' (${manifestData.version}).`;
      }

      // Extract 'overrides' folder if it exists (standard CurseForge format)
      const serverDir = path.join(dataRoot(), "local-servers", serverId);
      
      entries.forEach(entry => {
        if (entry.entryName.startsWith("overrides/") && !entry.isDirectory) {
          const relativePath = entry.entryName.substring("overrides/".length);
          const targetPath = path.join(serverDir, relativePath);
          const targetDir = path.dirname(targetPath);
          
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          
          fs.writeFileSync(targetPath, entry.getData());
        }
      });

      return NextResponse.json({ success: true, message });
    } finally {
      // Clean up
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  } catch (error: any) {
    console.error("POST import modpack error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
