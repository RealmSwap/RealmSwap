import type { ParamSpec } from "./types";

export type ParamValue = string | number | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface SettingsField extends ParamSpec {
  value: ParamValue;
}

/**
 * Effective settings values: stored user overrides layered on top of the
 * definition's declared defaults. Servers created before a definition grew new
 * params (empty/missing stored values) pick up the new defaults automatically.
 */
export function effectiveParamValues(params: ParamSpec[], stored: ParamValues): ParamValues {
  const out: ParamValues = {};
  for (const p of params) {
    const v = stored[p.key];
    out[p.key] = v === undefined || v === null || v === "" ? p.default ?? "" : v;
  }
  return out;
}

/** Field descriptors for settings forms: the param spec plus its effective value. */
export function assembleSettingsFields(params: ParamSpec[], stored: ParamValues): SettingsField[] {
  const values = effectiveParamValues(params, stored);
  return params.map((p) => ({ ...p, value: values[p.key] }));
}
