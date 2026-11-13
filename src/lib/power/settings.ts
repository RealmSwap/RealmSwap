import { getAppSetting, setAppSetting } from "@/lib/appSettings";

/**
 * How RealmSwap is allowed to influence this PC's sleep. Install-wide: the
 * machine sleeps or it doesn't, whoever is signed in to the dashboard.
 */
export interface PowerSettings {
  /** Hold the PC awake while people are (or may be) playing, and around scheduled starts. */
  keepAwake: boolean;
  /** Also hold it awake for any running server, even one known to be empty. */
  keepAwakeWhileRunning: boolean;
  /** Register a Windows wake timer ahead of the next scheduled start. */
  wakeForSchedule: boolean;
}

export const DEFAULT_POWER_SETTINGS: PowerSettings = {
  keepAwake: true,
  keepAwakeWhileRunning: false,
  wakeForSchedule: true,
};

const KEY = "power.settings";

export async function getPowerSettings(): Promise<PowerSettings> {
  const stored = await getAppSetting<Partial<PowerSettings>>(KEY, {});
  return {
    keepAwake: typeof stored?.keepAwake === "boolean" ? stored.keepAwake : DEFAULT_POWER_SETTINGS.keepAwake,
    keepAwakeWhileRunning:
      typeof stored?.keepAwakeWhileRunning === "boolean" ? stored.keepAwakeWhileRunning : DEFAULT_POWER_SETTINGS.keepAwakeWhileRunning,
    wakeForSchedule: typeof stored?.wakeForSchedule === "boolean" ? stored.wakeForSchedule : DEFAULT_POWER_SETTINGS.wakeForSchedule,
  };
}

/** Apply the boolean fields present in `patch`; anything else in it is ignored. */
export async function updatePowerSettings(patch: Record<string, unknown>): Promise<PowerSettings> {
  const next = await getPowerSettings();
  for (const field of Object.keys(DEFAULT_POWER_SETTINGS) as (keyof PowerSettings)[]) {
    if (typeof patch?.[field] === "boolean") next[field] = patch[field] as boolean;
  }
  await setAppSetting(KEY, next);
  return next;
}
