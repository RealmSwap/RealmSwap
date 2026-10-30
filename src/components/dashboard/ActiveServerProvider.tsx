"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/apiFetch";

const STORAGE_KEY = "rs-active-server";

interface ActiveServerContextType {
  servers: any[];
  loading: boolean;
  /** True when the last load failed — an empty list otherwise means "no servers yet". */
  loadFailed: boolean;
  activeServerId: string | null;
  activeServer: any | null;
  setActiveServerId: (id: string | null) => void;
  /** Re-fetch the server list; returns the fresh list. */
  refresh: () => Promise<any[]>;
}

const ActiveServerContext = createContext<ActiveServerContextType | undefined>(undefined);

/**
 * One shared "which server am I working on" selection for the whole dashboard.
 * Persisted in localStorage so navigating between Mods → Backups → Console
 * keeps targeting the same server instead of silently resetting to the first.
 */
export function ActiveServerProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeServerId, setActiveServerIdState] = useState<string | null>(null);
  // Distinguish "you have no servers" from "we couldn't load them" — a dead
  // API used to render as an empty dashboard.
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ servers?: any[] }>("/api/servers");
      const list: any[] = data?.servers ?? [];
      setServers(list);
      setLoadFailed(false);
      setActiveServerIdState((current) => {
        if (current && list.some((s) => s.id === current)) return current;
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(STORAGE_KEY);
        } catch {}
        if (stored && list.some((s) => s.id === stored)) return stored;
        return list[0]?.id ?? null;
      });
      return list;
    } catch (err: any) {
      setLoadFailed(true);
      toast.error(err?.message || "Couldn't load your servers — check that the app is still running.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveServerId = useCallback((id: string | null) => {
    setActiveServerIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId) ?? null,
    [servers, activeServerId]
  );

  return (
    <ActiveServerContext.Provider
      value={{ servers, loading, loadFailed, activeServerId, activeServer, setActiveServerId, refresh }}
    >
      {children}
    </ActiveServerContext.Provider>
  );
}

export function useActiveServer() {
  const context = useContext(ActiveServerContext);
  if (!context) {
    throw new Error("useActiveServer must be used within an ActiveServerProvider");
  }
  return context;
}
