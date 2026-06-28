import { describe, it, expect } from "vitest";
import { resolveTargetServerIds } from "@/app/api/players/[id]/whitelist/targets";

describe("resolveTargetServerIds", () => {
  it("'all' expands to every server id", () => {
    expect(resolveTargetServerIds({ all: true }, ["a", "b"])).toEqual(["a", "b"]);
  });
  it("explicit ids are intersected with owned servers", () => {
    expect(resolveTargetServerIds({ serverIds: ["a", "z"] }, ["a", "b"])).toEqual(["a"]);
  });
  it("empty when nothing specified", () => {
    expect(resolveTargetServerIds({}, ["a", "b"])).toEqual([]);
  });
});
