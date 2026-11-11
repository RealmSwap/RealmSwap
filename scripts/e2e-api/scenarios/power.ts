/**
 * Host power (PR-F): the internal keep-awake lookup the desktop shell polls,
 * and the ADMIN settings/status API behind Settings → Dedicated Box. Outside
 * the Windows desktop app these report the plan without touching the system,
 * which is exactly what this harness (a plain `next start`) exercises.
 */

import { expect } from "../client";
import { INTERNAL_TOKEN } from "../config";
import { scenario, step, type ScenarioContext } from "./framework";

export const powerScenarios = [
  scenario(
    "system/power",
    "keep-awake lookup (internal token) + power settings read/write (ADMIN)",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;

      await step("keep-awake lookup is internal-token only and answers a decision", async () => {
        const bare = await fetch(`${admin.baseUrl}/api/system/keep-awake`);
        expect(bare.status === 403, `no token → ${bare.status}, want 403`);
        const wrong = await fetch(`${admin.baseUrl}/api/system/keep-awake`, { headers: { "x-internal-token": "nope" } });
        expect(wrong.status === 403, `wrong token → ${wrong.status}, want 403`);
        // A dashboard session is not the internal token.
        const session = await admin.get("/api/system/keep-awake");
        expect(session.status === 403, `session without token → ${session.status}, want 403`);

        const res = await fetch(`${admin.baseUrl}/api/system/keep-awake`, { headers: { "x-internal-token": INTERNAL_TOKEN } });
        expect(res.status === 200, `with token → ${res.status}`);
        const body = await res.json();
        expect(typeof body.keepAwake === "boolean" && Array.isArray(body.reasons), `decision shape → ${JSON.stringify(body)}`);
        expect(body.keepAwake === body.reasons.length > 0, "a hold always comes with its reasons");
      });

      await step("power settings: session-gated, readable, and a change persists", async () => {
        const unauth = await fetch(`${admin.baseUrl}/api/system/power`);
        expect(unauth.status === 401, `unauth GET → ${unauth.status}, want 401`);

        const before = await admin.get("/api/system/power");
        expect(before.status === 200, `GET → ${before.status}: ${before.text.slice(0, 200)}`);
        expect(typeof before.body?.settings?.keepAwake === "boolean", "settings carry keepAwake");
        expect(before.body?.status?.desktop === false, "not the Windows desktop app → nothing is registered with the OS");
        expect(before.body?.status?.wakeRegisteredFor === null, "no wake timer outside the desktop app");

        const original = before.body.settings.keepAwakeWhileRunning;
        const changed = await admin.put("/api/system/power", { keepAwakeWhileRunning: !original, notASetting: 1 });
        expect(changed.status === 200, `PUT → ${changed.status}: ${changed.text.slice(0, 200)}`);
        expect(changed.body?.settings?.keepAwakeWhileRunning === !original, "the toggle took");
        const reread = await admin.get("/api/system/power");
        expect(reread.body?.settings?.keepAwakeWhileRunning === !original, "and persisted");

        const bad = await admin.put("/api/system/power", []);
        expect(bad.status === 400, `non-object body → ${bad.status}, want 400`);

        const restored = await admin.put("/api/system/power", { keepAwakeWhileRunning: original });
        expect(restored.body?.settings?.keepAwakeWhileRunning === original, "restored");
      });
    }
  ),
];
