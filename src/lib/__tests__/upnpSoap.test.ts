import { describe, it, expect } from "vitest";

import { addPortMappingArgs, escapeXml, parseSsdpLocation, pickUpnpService } from "@/lib/upnp";

/**
 * Pure helpers of the zero-dependency UPnP client that replaced nat-api
 * (whose `request` chain had no patched release). The network paths — SSDP
 * discovery and SOAP POSTs — are not unit-tested; this pins the XML/SSDP
 * parsing and the payload builder the SOAP calls depend on.
 */

const DEVICE_XML = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType>
        <controlURL>/ctl/L3F</controlURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType>
        <controlURL>/ctl/IPConn</controlURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:WANIPConnection:2</serviceType>
        <controlURL>/ctl/IPConn2</controlURL>
      </service>
    </serviceList>
  </device>
</root>`;

describe("UPnP client helpers", () => {
  it("picks WANIPConnection:2 over v1 and skips unrelated services", () => {
    const picked = pickUpnpService(DEVICE_XML);
    expect(picked?.serviceType).toContain("WANIPConnection:2");
    expect(picked?.controlUrl).toBe("/ctl/IPConn2");
  });

  it("falls back to WANPPPConnection when no WANIPConnection exists", () => {
    const xml = DEVICE_XML
      .replace(/WANIPConnection:2<\/serviceType>\s*<controlURL>\/ctl\/IPConn2<\/controlURL>\s*<\/service>/, "</service>")
      .replace(/WANIPConnection:1/, "WANPPPConnection:1");
    const picked = pickUpnpService(xml);
    expect(picked?.serviceType).toContain("WANPPPConnection");
  });

  it("returns null when the XML declares no WAN connection service", () => {
    expect(pickUpnpService("<service><serviceType>urn:x</serviceType></service>")).toBeNull();
    expect(pickUpnpService("")).toBeNull();
  });

  it("reads the LOCATION header case-insensitively and trims it", () => {
    expect(parseSsdpLocation("HTTP/1.1 200 OK\r\nST: urn:x\r\nLocation: http://192.168.1.1:5000/desc.xml\r\n")).toBe(
      "http://192.168.1.1:5000/desc.xml"
    );
    expect(parseSsdpLocation("HTTP/1.1 200 OK\r\nM-SEARCH * HTTP/1.1")).toBeNull();
  });

  it("escapes server names in the mapping description", () => {
    expect(escapeXml('Cozy & <PvE> "world"')).toBe("Cozy &amp; &lt;PvE&gt; &quot;world&quot;");
  });

  it("builds an AddPortMapping payload with the LAN IP and 1h lease", () => {
    const args = addPortMappingArgs(15637, "UDP", "RealmSwap - Enshrouded");
    expect(args).toContain("<NewExternalPort>15637</NewExternalPort>");
    expect(args).toContain("<NewProtocol>UDP</NewProtocol>");
    expect(args).toContain("<NewLeaseDuration>3600</NewLeaseDuration>");
    expect(args).toContain("<NewEnabled>1</NewEnabled>");
    expect(args).toMatch(/<NewInternalClient>(?!127\.0\.0\.1)[^<]+<\/NewInternalClient>/);
  });
});
