import type { GameDefinitionSpec, InstallMethod } from "./types";

export interface BuiltinDefinition {
  slug: string; displayName: string; icon: string; color: string;
  description: string; recommendedRamGB: number;
  installMethod: InstallMethod; spec: GameDefinitionSpec;
}

export const BUILTIN_DEFINITIONS: BuiltinDefinition[] = [
  {
    slug: "MINECRAFT", displayName: "Minecraft", icon: "⛏️",
    color: "from-green-500 to-emerald-700 bg-green-500/10 border-green-500/30 text-green-400",
    description: "Block building & survival", recommendedRamGB: 4.0,
    installMethod: "DOWNLOAD",
    spec: {
      install: {
        url: "https://piston-data.mojang.com/v1/objects/823e2250d24b3ddac457a60c92a6a941943fcd6a/server.jar",
        fileName: "server.jar", checkFile: "server.jar",
      },
      requiresJava: true,
      javaMajor: 25,
      launch: {
        executable: "java",
        executableOnPath: true,
        args: ["-Xms512M", "-Xmx{ram}G", "-jar", "server.jar", "nogui"],
        stdinStopCommand: "stop\n",
      },
      // Container runtime (Docker / remote nodes): the SteamCMD image has no
      // Java, so Minecraft pins its own image. The entrypoint downloads
      // server.jar on first boot (the temurin image ships no downloader —
      // see buildDownloadStartEntrypoint) and files live at the data-dir root
      // (no installSubDir), matching the local layout.
      container: {
        image: "eclipse-temurin:25-jre",
        executable: "java",
        executableOnPath: true,
        args: ["-Xms512M", "-Xmx{ram}G", "-jar", "server.jar", "nogui"],
      },
      defaultPort: 25565,
      params: [
        { key: "motd", label: "Server description (MOTD)", type: "text", default: "A RealmSwap Minecraft Server", group: "Presentation",
          help: "Shown in the server browser. Also editable later in Game Settings." },
        { key: "maxPlayers", label: "Max players", type: "number", default: 10, min: 1, max: 100, group: "Gameplay",
          help: "How many players can join at once." },
        { key: "difficulty", label: "Difficulty", type: "enum", default: "normal", options: ["peaceful", "easy", "normal", "hard"], group: "Gameplay" },
        { key: "gamemode", label: "Game mode", type: "enum", default: "survival", options: ["survival", "creative", "adventure", "spectator"], group: "Gameplay" },
        { key: "pvp", label: "PvP enabled", type: "boolean", default: true, group: "Gameplay" },
        { key: "onlineMode", label: "Online mode (verify accounts)", type: "boolean", default: false, group: "Network",
          help: "Require genuine Minecraft accounts. Leave off for LAN/offline play." },
        { key: "viewDistance", label: "View distance (chunks)", type: "number", default: 10, min: 3, max: 32, group: "Performance",
          help: "Higher values look better but cost CPU/RAM." },
      ],
      configFiles: [
        { path: "eula.txt", strategy: "template", template: "eula=true\n" },
        { path: "server.properties", strategy: "template",
          template: "server-port={port}\nquery.port=25565\nonline-mode={onlineMode}\nmax-players={maxPlayers}\nmotd={motd}\ndifficulty={difficulty}\ngamemode={gamemode}\npvp={pvp}\nview-distance={viewDistance}\n" },
      ],
      editableConfigPath: "server.properties",
      ports: [{ protocol: "TCP", port: "25565" }, { protocol: "UDP", port: "25565" }],
      playerSync: {
        strategy: "minecraft_json",
        whitelistPath: "whitelist.json",
        banlistPath: "banned-players.json",
        opsPath: "ops.json"
      },
    },
  },
  {
    slug: "VALHEIM", displayName: "Valheim", icon: "⛵",
    color: "from-amber-500 to-amber-700 bg-amber-500/10 border-amber-500/30 text-amber-400",
    description: "Co-op Viking exploration", recommendedRamGB: 6.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "896660", installSubDir: "valheim-server", checkFile: "valheim_server.exe", requiredDiskGB: 2.5 },
      passwordPolicy: { minLength: 5, fallback: "viking123" },
      launch: {
        executable: "valheim_server.exe", cwdSubDir: "valheim-server",
        args: ["-nographics", "-batchmode", "-name", "{name}", "-port", "2456", "-world", "{worldName}", "-password", "{password}", "-public", "1", "-crossplay"],
        stdoutPatterns: [{ regex: "registered with join code (\\w+)", updateField: "ipAddress", transform: "joinCode" }],
      },
      container: {
        executable: "valheim_server.x86_64",
        installSubDir: "valheim-server",
        // HOME redirect: Valheim's Unity layer writes worlds to
        // $HOME/.config/IronGate/Valheim — without this they land in the
        // container's writable layer and are destroyed by the rm -f + run
        // cycle on every start. /data is the bind-mounted server dir.
        env: { LD_LIBRARY_PATH: "./linux64", SteamAppId: "892970", HOME: "/data/valheim-data" },
        args: ["-nographics", "-batchmode", "-name", "{name}", "-port", "2456", "-world", "{worldName}", "-password", "{password}", "-public", "1", "-crossplay"],
      },
      defaultPort: 2456,
      params: [
        { key: "worldName", label: "World name", type: "text", default: "Dedicated", group: "World",
          help: "Which local world the server loads/creates. Changing it starts a fresh world." },
      ],
      configFiles: [],
      ports: [{ protocol: "UDP", port: "2456" }, { protocol: "UDP", port: "2457" }, { protocol: "UDP", port: "2458" }],
      playerSync: {
        strategy: "valheim_txt",
        whitelistPath: "valheim-server/permittedlist.txt",
        banlistPath: "valheim-server/bannedlist.txt",
        opsPath: "valheim-server/adminlist.txt"
      }
    },
  },
  {
    slug: "ENSHROUDED", displayName: "Enshrouded", icon: "🔥",
    color: "from-blue-500 to-indigo-700 bg-blue-500/10 border-blue-500/30 text-blue-400",
    description: "Co-op survival action RPG", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "2278520", installSubDir: "enshrouded-server", checkFile: "enshrouded_server.exe", requiredDiskGB: 4.0 },
      launch: { executable: "enshrouded_server.exe", cwdSubDir: "enshrouded-server", args: [] },
      defaultPort: 15637,
      params: [
        { key: "slotCount", label: "Player slots", type: "number", default: 16, min: 1, max: 16, group: "Gameplay",
          help: "Enshrouded caps dedicated servers at 16 slots." },
      ],
      configFiles: [{ path: "enshrouded_server.json", strategy: "enshroudedJson" }],
      editableConfigPath: "enshrouded-server/enshrouded_server.json",
      // No native Linux build (Windows-only launch config in the Steam app
      // manifest) — the Windows exe runs under Wine on the didstopia base,
      // same pattern as V Rising. Community reference (indifferentbroccoli's
      // image): xvfb-run --auto-servernum wine enshrouded_server.exe, no
      // steamclient.so path or winetricks needed, WINEPREFIX overridable.
      container: {
        image: "didstopia/base:nodejs-22-wine-steamcmd-ubuntu-24.04",
        executable: "xvfb-run",
        executableOnPath: true,
        installSubDir: "enshrouded-server",
        env: {
          WINEPREFIX: "/data/.wine-enshrouded",
          WINEDEBUG: "-all",
          CHOWN_DIRS: "/app,/steamcmd,/data",
        },
        args: ["--auto-servernum", "wine", "enshrouded_server.exe"],
      },
      ports: [
        { protocol: "TCP", port: "15636" }, { protocol: "UDP", port: "15636" },
        { protocol: "TCP", port: "15637" }, { protocol: "UDP", port: "15637" },
      ],
    },
  },
  {
    slug: "ZOMBOID", displayName: "Project Zomboid", icon: "🧟",
    color: "from-red-500 to-rose-700 bg-red-500/10 border-red-500/30 text-red-400",
    description: "Zombie survival RPG", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "380870", installSubDir: "zomboid-server", checkFile: "StartServer64.bat", requiredDiskGB: 3.0 },
      launch: {
        executable: "cmd.exe", executableOnPath: true, cwdSubDir: "zomboid-server",
        args: ["/c", "StartServer64.bat", "-cachedir=./zomboid-data", "-servername", "servertest"],
      },
      container: {
        executable: "start-server.sh",
        installSubDir: "zomboid-server",
        args: ["-cachedir=/data/zomboid-server/zomboid-data", "-servername", "servertest"],
      },
      defaultPort: 16261, params: [],
      configFiles: [{ path: "zomboid-data/Server/servertest.ini", strategy: "zomboidIniMerge" }],
      editableConfigPath: "zomboid-server/zomboid-data/Server/servertest.ini",
      ports: [{ protocol: "UDP", port: "16261" }, { protocol: "UDP", port: "16262" }, { protocol: "UDP", port: "8766" }],
    },
  },
  {
    slug: "ARK", displayName: "ARK: Survival Evolved", icon: "🦖",
    color: "from-cyan-500 to-blue-700 bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
    description: "Dinosaur taming action", recommendedRamGB: 12.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "376030", installSubDir: "ark-server", checkFile: "ShooterGame/Binaries/Win64/ShooterGameServer.exe", requiredDiskGB: 15.0 },
      launch: {
        executable: "ShooterGame/Binaries/Win64/ShooterGameServer.exe",
        cwdSubDir: "ark-server/ShooterGame/Binaries/Win64",
        args: [
          { value: ["TheIsland?SessionName={name}?ServerPassword={password}?Port=7777?QueryPort=27015?MaxPlayers={maxPlayers}"], includeWhen: "password" },
          { value: ["TheIsland?SessionName={name}?Port=7777?QueryPort=27015?MaxPlayers={maxPlayers}"], includeWhen: "passwordEmpty" },
          "-server", "-nosound", "-QueryPort=27015", "-automanagemods",
        ],
      },
      container: {
        executable: "ShooterGame/Binaries/Linux/ShooterGameServer",
        installSubDir: "ark-server",
        args: [
          { value: ["TheIsland?SessionName={name}?ServerPassword={password}?Port=7777?QueryPort=27015?MaxPlayers={maxPlayers}"], includeWhen: "password" },
          { value: ["TheIsland?SessionName={name}?Port=7777?QueryPort=27015?MaxPlayers={maxPlayers}"], includeWhen: "passwordEmpty" },
          "-server", "-nosound", "-QueryPort=27015", "-automanagemods",
        ],
      },
      defaultPort: 7777,
            params: [
        { key: "maxPlayers", label: "Max players", type: "number", default: 20, min: 1, max: 200, group: "Gameplay" },
      ],
      configFiles: [],
      ports: [{ protocol: "UDP", port: "7777" }, { protocol: "UDP", port: "7778" }, { protocol: "UDP", port: "27015" }],
    },
  },
  {
    slug: "TERRARIA", displayName: "Terraria", icon: "🌳",
    color: "from-lime-500 to-green-700 bg-lime-500/10 border-lime-500/30 text-lime-400",
    description: "2D sandbox adventure", recommendedRamGB: 2.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "282440", installSubDir: "terraria-server", checkFile: "TerrariaServer.exe", requiredDiskGB: 1.0 },
      launch: {
        executable: "TerrariaServer.exe", cwdSubDir: "terraria-server",
        args: [
          "-port", "7777", "-players", "{maxPlayers}",
          { value: ["-pass", "{password}"], includeWhen: "password" },
          "-autocreate", "1", "-worldname", "{nameSanitized}",
          "-world", "worlds/{nameSanitized}.wld",
        ],
      },
      container: {
        executable: "TerrariaServer.bin.x86_64",
        installSubDir: "terraria-server",
        args: [
          "-port", "7777", "-players", "{maxPlayers}",
          { value: ["-pass", "{password}"], includeWhen: "password" },
          "-autocreate", "1", "-worldname", "{nameSanitized}",
          "-world", "worlds/{nameSanitized}.wld",
        ],
      },
      defaultPort: 7777,
      params: [
        { key: "maxPlayers", label: "Max players", type: "number", default: 8, min: 1, max: 32, group: "Gameplay" },
      ], configFiles: [],
      ports: [{ protocol: "TCP", port: "7777" }, { protocol: "UDP", port: "7777" }],
    },
  },
  {
    slug: "PALWORLD", displayName: "Palworld", icon: "🦊",
    color: "from-orange-500 to-rose-700 bg-orange-500/10 border-orange-500/30 text-orange-400",
    description: "Creature-collecting survival", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "2394010", installSubDir: "palworld-server", checkFile: "PalServer.exe", requiredDiskGB: 4.0 },
      launch: {
        executable: "PalServer.exe", cwdSubDir: "palworld-server",
        args: [
          { value: ["?port=8211?players={maxPlayers}?AdminPassword={password}"], includeWhen: "password" },
          { value: ["?port=8211?players={maxPlayers}"], includeWhen: "passwordEmpty" },
          "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS",
        ],
      },
      container: {
        executable: "PalServer.sh",
        installSubDir: "palworld-server",
        args: [
          { value: ["?port=8211?players={maxPlayers}?AdminPassword={password}"], includeWhen: "password" },
          { value: ["?port=8211?players={maxPlayers}"], includeWhen: "passwordEmpty" },
          "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS",
        ],
      },
      defaultPort: 8211,
      params: [
        { key: "maxPlayers", label: "Max players", type: "number", default: 16, min: 1, max: 32, group: "Gameplay" },
        { key: "difficulty", label: "Difficulty", type: "enum", default: "None", options: ["None", "Normal", "Hard"], group: "Gameplay" },
      ],
      configFiles: [
        // Only the fields RealmSwap manages. The tuple-aware merge updates these
        // in place inside the game's full OptionSettings=(...) line — every other
        // field the game (or the user) wrote is preserved on rewrite.
        { path: "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini", strategy: "template",
          template: "[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(Difficulty={difficulty},ServerPlayerMaxNum={maxPlayers},ServerName=\"{name}\",AdminPassword=\"{password}\")\n" },
      ],
      editableConfigPath: "palworld-server/Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
      ports: [{ protocol: "UDP", port: "8211" }],
    },
  },
  {
    slug: "RUST", displayName: "Rust", icon: "⚙️",
    color: "from-stone-500 to-red-800 bg-stone-500/10 border-stone-500/30 text-stone-400",
    description: "PvP survival crafting", recommendedRamGB: 10.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "258550", installSubDir: "rust-server", checkFile: "RustDedicated.exe", requiredDiskGB: 10.0 },
      passwordPolicy: { minLength: 1, fallback: "changeme123" },
      launch: {
        executable: "RustDedicated.exe", cwdSubDir: "rust-server",
        args: [
          "-batchmode", "+server.port", "28015", "+server.identity", "servertest",
          "+server.seed", "{seed}", "+server.worldsize", "{worldSize}", "+server.maxplayers", "{maxPlayers}",
          "+server.hostname", "{name}", "+rcon.port", "28016", "+rcon.password", "{password}", "+rcon.web", "1",
        ],
      },
      container: {
        executable: "RustDedicated",
        installSubDir: "rust-server",
        env: { LD_LIBRARY_PATH: "." },
        args: [
          "-batchmode", "+server.port", "28015", "+server.identity", "servertest",
          "+server.seed", "{seed}", "+server.worldsize", "{worldSize}", "+server.maxplayers", "{maxPlayers}",
          "+server.hostname", "{name}", "+rcon.port", "28016", "+rcon.password", "{password}", "+rcon.web", "1",
        ],
      },
      defaultPort: 28015,
      params: [
        { key: "maxPlayers", label: "Max players", type: "number", default: 10, min: 1, max: 500, group: "Gameplay" },
        { key: "worldSize", label: "World size", type: "number", default: 3000, min: 1000, max: 6000, group: "World",
          help: "Map edge length in units (1000 = small, 3000 = default, 6000 = huge)." },
        { key: "seed", label: "World seed", type: "number", default: 12345, group: "World",
          help: "Changing this generates a brand-new map." },
      ],
      configFiles: [],
      editableConfigPath: "rust-server/server/servertest/cfg/server.cfg",
      ports: [{ protocol: "UDP", port: "28015" }, { protocol: "TCP", port: "28016" }],
    },
  },
  {
    slug: "WINDROSE", displayName: "Windrose", icon: "🧭",
    color: "from-teal-500 to-cyan-700 bg-teal-500/10 border-teal-500/30 text-teal-400",
    description: "Co-op seafaring adventure", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "4129620", installSubDir: "windrose-server", checkFile: "WindroseServer.exe", requiredDiskGB: 35.0 },
      // The server generates R5/ServerDescription.json on first launch with its own invite
      // code (an 8-char hex). Players join via the game client (Play -> Connect to Server)
      // with that code — not a direct IP. We read it from that file post-launch and surface
      // it as the connect info; we do NOT pre-write a config (the server ignores ours).
      launch: { executable: "WindroseServer.exe", cwdSubDir: "windrose-server", args: [], inviteCodeFile: "R5/ServerDescription.json" },
      defaultPort: 7777,
      params: [],
      configFiles: [],
      editableConfigPath: "windrose-server/R5/ServerDescription.json",
      // No native Linux build — Windows exe under Wine (didstopia base), same
      // pattern as V Rising/Enshrouded. Windrose is Unreal: the community
      // reference (indifferentbroccoli/windrose-server-docker) execs the UE
      // shipping binary DIRECTLY — the root WindroseServer.exe is a Windows
      // launcher — with plain -log; no steamclient.so path needed.
      container: {
        image: "didstopia/base:nodejs-22-wine-steamcmd-ubuntu-24.04",
        executable: "xvfb-run",
        executableOnPath: true,
        installSubDir: "windrose-server",
        env: {
          WINEPREFIX: "/data/.wine-windrose",
          WINEDEBUG: "-all",
          CHOWN_DIRS: "/app,/steamcmd,/data",
        },
        args: [
          "--auto-servernum", "wine",
          "R5/Binaries/Win64/WindroseServer-Win64-Shipping.exe", "-log",
        ],
      },
      ports: [{ protocol: "TCP", port: "7777" }, { protocol: "UDP", port: "7777" }],
    },
  },
  {
    slug: "SATISFACTORY", displayName: "Satisfactory", icon: "🏭",
    color: "from-orange-500 to-amber-700 bg-orange-500/10 border-orange-500/30 text-orange-400",
    description: "Co-op factory automation", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "1690800", installSubDir: "satisfactory-server", checkFile: "FactoryServer.exe", requiredDiskGB: 15.0 },
      // Server is administered in-game via the Server Manager (claim + set admin password
      // after first connecting from the game client); there is no CLI password or config file.
      // readyPattern omitted until a real first-launch log line is confirmed.
      launch: {
        executable: "FactoryServer.exe", cwdSubDir: "satisfactory-server",
        args: ["-log", "-unattended"],
      },
      // The Steam app ships a native Linux build; FactoryServer.sh wraps the
      // FactoryServer binary. It is exec'd via bash because Steam depots are
      // not guaranteed to preserve the executable bit on wrapper scripts.
      container: {
        executable: "bash",
        executableOnPath: true,
        installSubDir: "satisfactory-server",
        args: ["FactoryServer.sh", "-log", "-unattended"],
      },
      defaultPort: 7777,
      params: [], configFiles: [],
      ports: [
        { protocol: "TCP", port: "7777" }, { protocol: "UDP", port: "7777" },
        { protocol: "UDP", port: "8888" },
      ],
    },
  },
  {
    slug: "VRISING", displayName: "V Rising", icon: "🧛",
    color: "from-purple-500 to-red-800 bg-purple-500/10 border-purple-500/30 text-purple-400",
    description: "Vampire survival RPG", recommendedRamGB: 6.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "1829350", installSubDir: "vrising-server", checkFile: "VRisingServer.exe", requiredDiskGB: 5.0 },
      // Password/max-players live in save-data/Settings/ServerHostSettings.json (generated on
      // first launch); name + save are passed on the command line, which takes priority.
      // readyPattern omitted until a real first-launch log line is confirmed.
      launch: {
        executable: "VRisingServer.exe", cwdSubDir: "vrising-server",
        preLaunchDirs: ["save-data"],
        args: ["-persistentDataPath", "./save-data", "-serverName", "{name}", "-saveName", "world1"],
      },
      // V Rising has NO native Linux build (Windows-only launch config in the
      // Steam app manifest). Containers run the Windows exe under Wine on the
      // didstopia base image (WineHQ stable + steamcmd + xvfb; registry-verified:
      // ENTRYPOINT exec-gosu's our bash -lc through, steamcmd lands on PATH,
      // CHOWN_DIRS grants the docker user write access to /data).
      container: {
        image: "didstopia/base:nodejs-22-wine-steamcmd-ubuntu-24.04",
        executable: "xvfb-run",
        executableOnPath: true,
        installSubDir: "vrising-server",
        env: {
          // Wine prefix persists on the bind mount — without this every start
          // (containers are rm -f + run) re-initializes a fresh prefix.
          WINEPREFIX: "/data/.wine-vrising",
          WINEDEBUG: "-all",
          // Entrypoint chowns these comma-separated dirs to its docker user.
          CHOWN_DIRS: "/app,/steamcmd,/data",
          // The game ships its own 64-bit steamclient.so (Didstopia's launch
          // script sets this; without it Steam API init fails under Wine).
          LD_LIBRARY_PATH: "/data/vrising-server/VRisingServer_Data/Plugins/x86_64",
        },
        args: [
          "--auto-servernum",
          "--server-args=-screen 0 640x480x24:32 -nolisten tcp -nolisten unix",
          "wine", "VRisingServer.exe",
          "-persistentDataPath", "./save-data", "-serverName", "{name}", "-saveName", "world1",
          // Unity >2048-allocator SEH crash on high-core-count hosts; a lower
          // worker count is always honored (Didstopia pins 8 the same way).
          "-job-worker-count", "8",
        ],
      },
      defaultPort: 9876, params: [], configFiles: [],
      editableConfigPath: "vrising-server/save-data/Settings/ServerHostSettings.json",
      ports: [{ protocol: "UDP", port: "9876" }, { protocol: "UDP", port: "9877" }],
    },
  },
];
