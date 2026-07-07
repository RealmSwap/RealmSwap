import { Prisma } from "@/generated/client";
import { GameDefinitionSpec, ParamSpec, ArgSpec } from "./definitions/types";

export interface PterodactylVariable {
  name: string;
  description: string;
  env_variable: string;
  default_value: string;
  user_viewable: boolean;
  user_editable: boolean;
  rules: string;
}

export interface PterodactylEgg {
  name: string;
  description: string;
  image: string;
  startup: string;
  variables: PterodactylVariable[];
}

export function parsePterodactylEgg(eggJson: string, ownerId?: string): Omit<Prisma.GameDefinitionCreateInput, "id" | "createdAt" | "updatedAt"> {
  const egg: PterodactylEgg = JSON.parse(eggJson);

  const slug = egg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  
  const params: ParamSpec[] = egg.variables.map(v => {
    let type: "text" | "number" | "boolean" = "text";
    if (v.rules.includes("numeric") || v.rules.includes("integer")) type = "number";
    if (v.rules.includes("boolean")) type = "boolean";

    return {
      key: v.env_variable,
      label: v.name,
      type,
      default: v.default_value,
      required: v.rules.includes("required")
    };
  });

  // Convert Pterodactyl {{VAR}} to our template or environment vars
  // Pterodactyl injects them as Environment Variables natively, but the startup command also references them.
  // GameVault passes params via `paramValues` or as env vars depending on the runner.
  // For simplicity, we map the startup string by replacing {{VAR}} with ${VAR} (or just passing the startup string as a custom bash script/launch script).
  
  const startupCmd = egg.startup.replace(/{{(.*?)}}/g, "$$$1");

  const spec: GameDefinitionSpec = {
    defaultPort: 25565, // Needs manual adjustment usually
    ports: [],
    params,
    configFiles: [],
    install: {
      installScript: "# Imported from Pterodactyl Egg. Manual adjustment required."
    },
    launch: {
      executable: "bash",
      args: ["-c", startupCmd],
      executableOnPath: true,
      env: {}
    },
    container: {
      image: egg.image,
      executable: "bash",
      args: ["-c", startupCmd]
    }
  };

  return {
    slug,
    displayName: egg.name,
    description: egg.description || "Imported from Pterodactyl Egg",
    installMethod: "CUSTOM_SCRIPT",
    spec: JSON.stringify(spec, null, 2),
    owner: ownerId ? { connect: { id: ownerId } } : undefined,
    isBuiltIn: false
  };
}
