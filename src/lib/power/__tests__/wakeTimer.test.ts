import { describe, it, expect } from "vitest";
import { buildWakeTaskXml, toTaskLocalTime, taskXmlBuffer, parseWakeTimerPolicy } from "../wakeTimer";

describe("wake task XML", () => {
  const at = new Date(2026, 10, 13, 18, 57, 0); // local Friday evening
  const xml = buildWakeTaskXml({ at, command: "C:\\Program Files\\RealmSwap\\RealmSwap.exe", args: "--wake" });

  it("uses local wall-clock time for the boundary", () => {
    expect(toTaskLocalTime(at)).toBe("2026-11-13T18:57:00");
    expect(xml).toContain("<StartBoundary>2026-11-13T18:57:00</StartBoundary>");
    expect(xml).toContain("<EndBoundary>2026-11-13T19:57:00</EndBoundary>");
  });

  it("asks Windows to wake and to clean the task up when it expires", () => {
    expect(xml).toContain("<WakeToRun>true</WakeToRun>");
    expect(xml).toContain("<DeleteExpiredTaskAfter>PT0S</DeleteExpiredTaskAfter>");
    expect(xml).toContain("<ExecutionTimeLimit>PT5M</ExecutionTimeLimit>");
  });

  it("carries the launch action and runs as the signed-in user, least privilege", () => {
    expect(xml).toContain("<Command>C:\\Program Files\\RealmSwap\\RealmSwap.exe</Command>");
    expect(xml).toContain("<Arguments>--wake</Arguments>");
    expect(xml).toContain("<LogonType>InteractiveToken</LogonType>");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
  });

  it("escapes XML-special characters in the command", () => {
    const escaped = buildWakeTaskXml({ at, command: "C:\\a<b>&c.exe" });
    expect(escaped).toContain("C:\\a&lt;b&gt;&amp;c.exe");
  });

  it("is written as UTF-16 with the BOM schtasks requires", () => {
    const buf = taskXmlBuffer(xml);
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xfe);
    expect(buf.toString("utf16le", 2)).toContain("<?xml");
  });
});

// powercfg's output labels are localized; the values after the last two
// "0x000000xx" indexes are not.
describe("parseWakeTimerPolicy", () => {
  const english = `
Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
  Subgroup GUID: 238c9fa8-0aad-41ed-83f4-97be242c8f20  (Sleep)
    Power Setting GUID: bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d  (Allow wake timers)
      Minimum Possible Setting: 0x00000000
      Maximum Possible Setting: 0x00000002
      Possible Settings increment: 0x00000001
      Possible Settings increment: 0x00000001
    Current AC Power Setting Index: 0x00000001
    Current DC Power Setting Index: 0x00000000
`;
  it("reads the last two indexes as AC and DC", () => {
    expect(parseWakeTimerPolicy(english)).toEqual({ ac: "enabled", dc: "disabled" });
  });

  it("knows the important-wake-timers-only value", () => {
    expect(parseWakeTimerPolicy("idx 0x00000002\nidx 0x00000002\n")).toEqual({ ac: "important-only", dc: "important-only" });
  });

  it("says unknown when the output can't be parsed", () => {
    expect(parseWakeTimerPolicy("no hex here")).toEqual({ ac: "unknown", dc: "unknown" });
  });
});
