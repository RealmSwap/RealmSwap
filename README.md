# RealmSwap 🎮

RealmSwap is a powerful, locally-hosted game server manager that allows you to easily deploy, monitor, and manage dedicated servers for your favorite multiplayer games—**100% free and without cloud subscription fees.**

Ditch paying for multiple cloud servers your friends only play half the time. Host your own worlds locally on your PC, archive them to your hard drive when you switch games, and restore them instantly. Zero data loss, zero wasted cash.

## Supported Games
RealmSwap currently supports single-click deployment for the following dedicated servers out-of-the-box:
- **Minecraft** (Vanilla 1.20+)
- **Valheim**
- **Enshrouded**
- **Project Zomboid**
- **ARK: Survival Evolved**
- **Terraria**
- **Palworld**
- **Rust**

*Custom server definitions are also supported via our JSON-based Game Definition Engine!*

## Key Features
- **One-Click Deployments**: Instantly spin up dedicated servers. The app automatically downloads and configures SteamCMD (and direct JAR downloads for Minecraft) behind the scenes.
- **Auto-Port Forwarding (UPnP)**: Automatically maps and unmaps router ports using UPnP, allowing friends to join using your public IP without logging into your router.
- **Server Readiness Checks**: Validates available disk space, missing dependencies (like SteamCMD), and port availability *before* deployment to prevent frustrating mid-install crashes.
- **Live Server Console**: Interact directly with your running servers. Read live logs and send commands straight from the dashboard.
- **Real-time Monitoring**: Track live server CPU and memory usage with beautiful dashboard sparklines powered by WMI and PowerShell polling.
- **Crash Detection & Auto-Restart**: Automatically detects server crashes and attempts to restart them up to 3 times within a 10-minute window using our robust crash policy engine.
- **Server Config Editor**: Edit raw server configurations (`.ini`, `.json`, `.properties`) directly from the dashboard.
- **Backup & Restore**: Easily take snapshot backups of your world data and restore them with a single click.
- **Mod Manager**: Built-in support for searching, installing, and managing mods for supported games.
- **Collaborators**: Invite friends to have Co-Host or Admin permissions to help manage the server while you are away.
- **Audit Logs**: Keep track of every action performed on your servers with detailed security audit logs.

## Technology & Architecture
- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons
- **Backend API**: Next.js API Routes, Node.js (`child_process`), Prisma ORM
- **Desktop Wrapper**: Electron builder with embedded standalone Node server
- **Database**: SQLite (Local file-based, zero configuration)
- **Runner Abstraction Layer**: RealmSwap abstracts server execution behind a `ServerRunner` interface. Currently powered by `LocalWindowsRunner` for native execution, with `DockerRunner` and containerized deployments in the works!

## Getting Started

**Prerequisites:**
You must have [Node.js](https://nodejs.org/) (which includes `npm`) and [Git](https://git-scm.com/) installed on your computer.

1. Clone the repository to your Windows machine:
   ```bash
   git clone https://github.com/RealmSwap/RealmSwap.git
   cd RealmSwap
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Initialize the database:
   ```bash
   npm run db:push
   ```
4. Run the development server (web-only):
   ```bash
   npm run dev
   ```
   *OR* run the desktop application directly:
   ```bash
   npm run electron:dev
   ```
5. If using the web version, open `http://localhost:3000` in your browser.

*Note: RealmSwap currently defaults to Windows environments due to its `LocalWindowsRunner` implementation for `child_process` commands and SteamCMD paths. Cross-platform Docker support is actively being developed.*

## Roadmap & Contributing
Contributions are welcome! Please ensure you branch off `main` and submit pull requests.
We are currently focusing on:
- Docker container abstractions for true cross-platform hosting
- Replacing native browser dialogs with custom UI modals
- More extensive game server definitions!
- Community Marketplace for sharing custom game configurations and mods
- Discord Bot Integration for managing servers directly from your Discord server
