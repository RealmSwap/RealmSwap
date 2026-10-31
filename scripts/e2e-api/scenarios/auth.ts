/**
 * Auth end-to-end: every request flows through the app's real /api/auth/*
 * routes against the fake Supabase (which enforces real passwords and issues
 * real HS256 tokens the app verifies through its offline path). Covers the
 * unauthenticated rejection path, login, the first-user-ADMIN local mirror,
 * a second account, password update, recovery request, and logout.
 */

import { expect } from "../client";
import { MEMBER_USER, ADMIN_USER } from "../config";
import { scenario, step, type ScenarioContext } from "./framework";

const MEMBER_NEW_PASSWORD = "e2e-member-rotated-password";
/** The member password after the auth scenario's rotation — later scenarios re-login as member. */
export const MEMBER_USER_AFTER_ROTATION = { ...MEMBER_USER, password: MEMBER_NEW_PASSWORD };

export const authScenarios = [
  scenario(
    "auth/session-lifecycle",
    "401s without a session, login mirrors the first user, second account, password update, logout",
    ["smoke"],
    async (ctx: ScenarioContext) => {
      const { admin } = ctx;

      await step("unauthenticated requests are rejected", async () => {
        const servers = await admin.get("/api/servers");
        expect(servers.status === 401, `GET /api/servers without session → ${servers.status}, want 401`);
        const defs = await admin.get("/api/definitions");
        expect(defs.status === 401, `GET /api/definitions without session → ${defs.status}, want 401`);
      });

      await step("login rejects bad credentials", async () => {
        const res = await admin.post("/api/auth/login", { email: ADMIN_USER.email, password: "definitely-wrong" });
        expect(res.status === 401, `bad-password login → ${res.status}, want 401`);
      });

      await step("login succeeds and sets session cookies", async () => {
        const res = await admin.post("/api/auth/login", ADMIN_USER);
        expect(res.status === 200, `login → ${res.status}: ${res.text.slice(0, 200)}`);
        expect(res.body?.success === true, "login response should carry success:true");
        expect(res.body?.user?.email === ADMIN_USER.email, "login response carries the user email");
      });

      await step("session grants access and the first local user mirrors as ADMIN", async () => {
        const res = await admin.get("/api/servers");
        expect(res.status === 200, `GET /api/servers → ${res.status}`);
        expect(res.body?.user?.email === ADMIN_USER.email, "list payload carries the user");
        expect(Array.isArray(res.body?.servers), "list payload carries a servers array");
        const logins = (res.body?.activityLogs ?? []).filter((l: any) => l.action === "USER_LOGIN");
        expect(logins.length >= 1, "USER_LOGIN activity rows were written by the login route");
      });

      await step("register creates a second account through the real signup route", async () => {
        const res = await admin.post("/api/auth/register", MEMBER_USER);
        expect(res.status === 200 || res.status === 201, `register → ${res.status}: ${res.text.slice(0, 200)}`);
      });

      await step("second user can log in and gets their own scope", async () => {
        admin.clearCookies();
        const login = await admin.post("/api/auth/login", MEMBER_USER);
        expect(login.status === 200, `member login → ${login.status}`);
        const list = await admin.get("/api/servers");
        expect(list.status === 200, `member GET /api/servers → ${list.status}`);
        expect(list.body?.user?.email === MEMBER_USER.email, "member list payload carries the member identity");
        expect((list.body?.servers ?? []).length === 0, "member starts with no servers");
      });

      await step("update-password changes the credential through the real route", async () => {
        const update = await admin.post("/api/auth/update-password", { password: MEMBER_NEW_PASSWORD });
        expect(update.status === 200, `update-password → ${update.status}: ${update.text.slice(0, 200)}`);
        admin.clearCookies();
        const oldPw = await admin.post("/api/auth/login", { ...MEMBER_USER, password: MEMBER_USER.password });
        expect(oldPw.status === 401, `old password must stop working → ${oldPw.status}, want 401`);
        const newPw = await admin.post("/api/auth/login", { ...MEMBER_USER, password: MEMBER_NEW_PASSWORD });
        expect(newPw.status === 200, `new password works → ${newPw.status}`);
      });

      await step("reset-password responds neutrally (delivery is upstream)", async () => {
        const res = await admin.post("/api/auth/reset-password", { email: MEMBER_USER.email });
        expect(res.status === 200, `reset-password → ${res.status}, want neutral 200`);
      });

      await step("logout clears the session", async () => {
        const out = await admin.post("/api/auth/logout");
        expect(out.status === 200, `logout → ${out.status}`);
        const after = await admin.get("/api/servers");
        expect(after.status === 401, `GET /api/servers after logout → ${after.status}, want 401`);
      });

      await step("restore the admin session for later scenarios", async () => {
        admin.clearCookies();
        const res = await admin.post("/api/auth/login", ADMIN_USER);
        expect(res.status === 200, `admin re-login → ${res.status}`);
      });
    }
  ),
];
