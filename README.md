# RealmSwap 🎮

RealmSwap is a powerful, locally-hosted game server manager that allows you to easily deploy, monitor, and manage dedicated servers for your favorite multiplayer games—100% free and without cloud subscription fees.

## Supported Games
RealmSwap currently supports single-click deployment for the following dedicated servers:
- **Minecraft** (Vanilla 1.20+)
- **Valheim**
- **Enshrouded**
- **Project Zomboid**
- **ARK: Survival Evolved**
- **Terraria**
- **Palworld**
- **Rust**

## Key Features
- **One-Click Deployments**: Instantly spin up dedicated servers via SteamCMD (and direct JAR downloads for Minecraft).
- **Auto-Port Forwarding**: Automatically maps and unmaps router ports using UPnP, allowing friends to join using your public IP.
- **Real-time Monitoring**: Track live server CPU and memory usage with beautiful dashboard sparklines.
- **Crash Detection & Auto-Restart**: Automatically detects server crashes and attempts to restart them up to 3 times within a 10-minute window.
- **Server Config Editor**: Edit raw server configurations (`.ini`, `.json`, `.properties`) directly from the dashboard.
- **Backup & Restore**: Easily take snapshot backups of your world data and restore them with a single click.
- **Mod Manager**: Built-in support for searching, installing, and managing mods for supported games (like Minecraft Modrinth integration).
- **Collaborators**: Invite friends to have Co-Host or Admin permissions to help manage the server while you are away.
- **Audit Logs**: Keep track of every action performed on your servers with detailed security audit logs.

## Technology Stack
- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons
- **Backend**: Next.js API Routes, Node.js (`child_process`), Prisma ORM
- **Database**: SQLite (Local)
- **External Dependencies**: SteamCMD, UPnP APIs

## Getting Started

**Prerequisites:**
You must have [Node.js](https://nodejs.org/) (which includes `npm`) and [Git](https://git-scm.com/) installed on your computer.

1. Clone the repository to your Windows machine.
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

*Note: RealmSwap is currently designed to run on Windows environments due to its heavy reliance on Windows-specific `child_process` commands and directory structures for SteamCMD.*
