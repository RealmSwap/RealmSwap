import { describe, it, expect } from "vitest";
import { aklizProvider } from "../aklizProvider";
import { getProvider } from "../registry";
import { HostCredentials } from "../types";

const valid: HostCredentials = {
  host: "bos-sr-1-1-1.akliz.net",
  port: 22,
  username: "user@email.com.123",
  password: "pw",
  remoteBasePath: ".",
};

describe("aklizProvider.validateCredentials", () => {
  it("accepts well-formed credentials", () => {
    expect(aklizProvider.validateCredentials(valid)).toBeNull();
  });
  it("rejects an empty host", () => {
    expect(aklizProvider.validateCredentials({ ...valid, host: "" })).toMatch(/host/i);
  });
  it("rejects an out-of-range port", () => {
    expect(aklizProvider.validateCredentials({ ...valid, port: 0 })).toMatch(/port/i);
    expect(aklizProvider.validateCredentials({ ...valid, port: 70000 })).toMatch(/port/i);
  });
  it("rejects an empty username or password", () => {
    expect(aklizProvider.validateCredentials({ ...valid, username: "" })).toMatch(/username/i);
    expect(aklizProvider.validateCredentials({ ...valid, password: "" })).toMatch(/password/i);
  });
  it("rejects an empty remote base path", () => {
    expect(aklizProvider.validateCredentials({ ...valid, remoteBasePath: "" })).toMatch(/path/i);
  });
});

describe("registry", () => {
  it("resolves the AKLIZ provider", () => {
    expect(getProvider("AKLIZ").id).toBe("AKLIZ");
  });
  it("throws on an unknown provider", () => {
    expect(() => getProvider("NOPE")).toThrow();
  });
});
