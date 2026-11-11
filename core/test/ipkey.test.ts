import { describe, expect, it } from "vitest";
import { LiveCaps, forwardedKey, forwardedKeyWarnOnce, ipKey } from "../src/index.ts";

describe("H4: the per-IP cap keys an IPv6 caller by its /64", () => {
  it("ipv6_rotation_inside_a_64_shares_one_cap: 100 addresses in one /64 are one network", () => {
    const caps = new LiveCaps({ perToken: 1000, perIp: 3, global: 1000 }, () => 0);
    const hits = Array.from({ length: 100 }, (_, i) => caps.takeOrWhy(`t${i}`, ipKey(`2001:db8:aa:bb::${(i + 1).toString(16)}`)));
    expect(hits.filter((h) => h === null)).toHaveLength(3);
    expect(hits.slice(3).every((h) => h === "ip")).toBe(true);
    // Control: a different /64 still has its own count.
    expect(caps.takeOrWhy("other", ipKey("2001:db8:aa:bc::1"))).toBeNull();
  });

  it("one key per address form: compressed, expanded, bracketed, zoned and IPv4-mapped forms agree", () => {
    const k = ipKey("2001:db8:0:1::5");
    expect(k).toBe("2001:db8:0:1::/64");
    for (const a of ["2001:0db8:0000:0001:0000:0000:0000:0009", "[2001:db8:0:1:ffff::1]", "2001:DB8:0:1::7%eth0", " 2001:db8::1:0:0:0:1 "]) expect(ipKey(a)).toBe(k);
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("203.0.113.8")).not.toBe(ipKey("203.0.113.7")); // IPv4 stays per address
    // H4 review: leading zeros, port suffixes and the other IPv4-mapped spellings name the same caller.
    for (const v of ["203.000.113.007", "203.0.113.7:5678", "::ffff:cb00:7107", "0:0:0:0:0:ffff:203.0.113.7", "[::ffff:203.0.113.7]:443"]) expect(ipKey(v)).toBe("203.0.113.7");
    expect(ipKey("[2001:db8:0:1::9]:443")).toBe(k);
    expect(ipKey("::ffff:cb00:7107")).not.toBe(ipKey("::1"));
  });

  it("junk shares one key and never throws", () => {
    for (const a of ["", "unknown", "abc", "1:2:3:4:5:6:7:8::9", "1::2::3", "1:2:3", "12345::1", "999.1.1.1", "1.2.3.4, 5.6.7.8", "g::1"]) {
      expect(ipKey(a)).toBe("unknown");
    }
  });
});

describe("H4 live check: the per-IP key behind Render's proxies", () => {
  // Live, Wed Oct 28: 8 control takes from one machine with 3 cookies left a 4th cookie at 3 of 3, because the last
  // X-Forwarded-For entry is the proxy hop, a different address on each request.
  const edge = (i: number) => `172.71.${i}.${i + 10}`;

  it("rotating_proxy_hops_share_one_client_key: one caller through 8 different edges is one network", () => {
    const caps = new LiveCaps({ perToken: 3, perIp: 10, global: 300 }, () => 0);
    for (let i = 0; i < 8; i++) expect(caps.takeOrWhy(`t${Math.floor(i / 3)}`, forwardedKey(`198.51.100.4, ${edge(i)}`, 2))).toBeNull();
    expect(caps.triesLeft("fresh", forwardedKey(`198.51.100.4, ${edge(9)}`, 2))).toBe(2);
    // Control: another caller through the same edge has its own count.
    expect(caps.triesLeft("fresh", forwardedKey(`203.0.113.7, ${edge(0)}`, 2))).toBe(3);
  });

  it("spoofed_entries_cant_mint_keys: whatever a client types sits left of the hop that names it", () => {
    for (const typed of ["9.9.9.9", "1.1.1.1, 8.8.8.8", "unknown", "2001:db8::1"]) {
      expect(forwardedKey(`${typed}, 198.51.100.4, ${edge(1)}`, 2)).toBe("198.51.100.4");
    }
  });

  it("too_few_entries_is_unknown: a header that skipped the proxies is never guessed at", () => {
    for (const x of ["", "198.51.100.4"]) expect(forwardedKey(x, 2)).toBe("unknown");
    expect(forwardedKey("198.51.100.4", 0)).toBe("unknown");
    expect(forwardedKey("198.51.100.4", 1)).toBe("198.51.100.4");
  });

  it("short_chain_warns_once (W81): fewer entries than PROXY_HOPS is said the first time, then quietly shares the one key", () => {
    const said: string[] = [];
    const key = forwardedKeyWarnOnce(3, (m) => said.push(m));
    // A whole chain: its own key, and nothing said.
    expect(key(`198.51.100.4, ${edge(0)}, ${edge(1)}`)).toBe("198.51.100.4");
    expect(said).toEqual([]);
    // Short chains (one entry, two, none at all): "unknown", said once with the count, never the address.
    expect(key("198.51.100.4")).toBe("unknown");
    expect(key(`198.51.100.4, ${edge(2)}`)).toBe("unknown");
    expect(key("")).toBe("unknown");
    expect(said).toEqual(["clientIp: X-Forwarded-For had 1 entry, fewer than PROXY_HOPS 3; per-IP caps share one key until the chain is whole"]);
    expect(said.join(" ")).not.toContain("198.51.100.4");
    // A whole chain whose entry isn't an address is the other reason, said once too.
    expect(key(`not-an-ip, ${edge(0)}, ${edge(1)}`)).toBe("unknown");
    expect(key(`also-not, ${edge(0)}, ${edge(1)}`)).toBe("unknown");
    expect(said).toHaveLength(2);
    expect(said[1]).toMatch(/^clientIp: X-Forwarded-For of shape .* has no address 3 from the right/);
  });
});
