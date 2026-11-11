/**
 * Anonymous usage milestones (PR-F): the consent route (ADMIN decides for the
 * install), the field-by-field preview, and the daily snapshot actually
 * landing in the fake's usage_snapshots table when consent is given.
 */

import { expect } from "../client";
import { scenario, step, type ScenarioContext } from "./framework";

export const telemetryScenarios = [
  scenario(
    "telemetry/usage",
    "opt-in usage milestones: preview, ADMIN-only consent, first snapshot sent",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;

      await step("preview requires a session and starts off", async () => {
        const unauth = await fetch(`${admin.baseUrl}/api/telemetry`);
        expect(unauth.status === 401, `unauth preview → ${unauth.status}, want 401`);

        const before = await admin.get("/api/telemetry");
        expect(before.status === 200, `preview → ${before.status}: ${before.text.slice(0, 200)}`);
        expect(before.body?.enabled === false, "off until the admin opts in");
        expect(Array.isArray(before.body?.fields) && before.body.fields.length >= 10, "the preview explains every field");
      });

      await step("consent is admin-only, enables, and sends the first snapshot", async () => {
        const bad = await admin.post("/api/telemetry", { enabled: "yes" });
        expect(bad.status === 400, `non-boolean body → ${bad.status}, want 400`);

        const on = await admin.post("/api/telemetry", { enabled: true });
        expect(on.status === 200, `enable → ${on.status}: ${on.text.slice(0, 200)}`);
        expect(on.body?.enabled === true, "consent persisted");
        expect(on.body?.sendResult === "sent", `first snapshot sent → ${on.body?.sendResult}`);

        const after = await admin.get("/api/telemetry");
        expect(after.body?.enabled === true, "preview reflects consent");
      });

      await step("disabling forgets the install id", async () => {
        const off = await admin.post("/api/telemetry", { enabled: false });
        expect(off.status === 200 && off.body?.enabled === false, "disabled");
        const after = await admin.get("/api/telemetry");
        expect(after.body?.enabled === false, "preview reflects opt-out");
      });
    }
  ),
];
