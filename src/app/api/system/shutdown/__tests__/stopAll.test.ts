import { describe, it, expect, vi } from "vitest";
import { stopAllRunningServers } from "../stopAll";

describe("stopAllRunningServers", () => {
  it("stops each running/starting server and returns the count", async () => {
    const find = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const stop = vi.fn().mockResolvedValue(undefined);
    const count = await stopAllRunningServers(find, stop);
    expect(count).toBe(2);
    expect(stop).toHaveBeenCalledWith("a");
    expect(stop).toHaveBeenCalledWith("b");
  });

  it("returns 0 when nothing is running", async () => {
    const find = vi.fn().mockResolvedValue([]);
    const stop = vi.fn();
    const count = await stopAllRunningServers(find, stop);
    expect(count).toBe(0);
    expect(stop).not.toHaveBeenCalled();
  });

  it("swallows a throwing stop and still returns the full count", async () => {
    const find = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const stop = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const count = await stopAllRunningServers(find, stop);
    expect(count).toBe(2);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
