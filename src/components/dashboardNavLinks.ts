import {
  Wrench,
  FolderSync,
  Settings,
  Terminal,
  Clock,
  Users,
  History,
  HardDrive,
  type LucideIcon,
} from "lucide-react";

export interface DashboardNavLink {
  label: string;
  icon: LucideIcon;
  href: string;
}

/**
 * The "Features" sidebar links shared by every dashboard view. Each view marks
 * its own entry active by comparing `href` to its current route.
 */
export const DASHBOARD_NAV_LINKS: DashboardNavLink[] = [
  { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods" },
  { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
  { label: "Server Config", icon: Settings, href: "/dashboard/config" },
  { label: "Server Console", icon: Terminal, href: "/dashboard/console" },
  { label: "Schedules", icon: Clock, href: "/dashboard/schedules" },
  { label: "Team Members", icon: Users, href: "/dashboard/team" },
  { label: "Audit Logs", icon: History, href: "/dashboard/logs" },
  { label: "File Locations", icon: HardDrive, href: "/dashboard/storage" },
];
