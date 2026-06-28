import { describe, it, expect } from "vitest";
import { parseWindroseInviteCode } from "../windrose";

describe("parseWindroseInviteCode", () => {
  it("extracts the invite code from the wrapped ServerDescription_Persistent object", () => {
    const content = JSON.stringify({
      Version: 1,
      DeploymentId: "0.10.0.7.33-372c3516",
      ServerDescription_Persistent: { InviteCode: "694f0ba1", IsPasswordProtected: false },
    });
    expect(parseWindroseInviteCode(content)).toBe("694f0ba1");
  });

  it("returns null when the invite code is missing or empty", () => {
    expect(parseWindroseInviteCode(JSON.stringify({ ServerDescription_Persistent: {} }))).toBeNull();
    expect(parseWindroseInviteCode(JSON.stringify({ ServerDescription_Persistent: { InviteCode: "" } }))).toBeNull();
    expect(parseWindroseInviteCode(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("returns null for malformed or partial JSON (file caught mid-write)", () => {
    expect(parseWindroseInviteCode('{ "ServerDescription_Persistent": { "InviteCode": ')).toBeNull();
    expect(parseWindroseInviteCode("")).toBeNull();
  });
});
