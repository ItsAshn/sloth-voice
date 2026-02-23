/**
 * publicAddress.js — dynamic PUBLIC_ADDRESS resolution
 *
 * Determines the server's public IPv4 address and keeps it current as the IP
 * changes over time.  Works for every hosting scenario without any manual
 * configuration:
 *
 *   1. Static IPv4 (e.g. a VPS with a fixed IP)
 *      Set PUBLIC_ADDRESS=203.0.113.42 and the value is used as-is.
 *      No polling is started because the IP will never change.
 *
 *   2. DDNS hostname (e.g. foo.duckdns.org, myserver.no-ip.com, …)
 *      Set PUBLIC_ADDRESS=yourname.duckdns.org.  At startup the hostname is
 *      resolved to IPv4 and stored.  The watcher re-resolves the hostname
 *      every IP_CHECK_INTERVAL seconds so the ICE candidates stay correct
 *      after your DDNS client updates the record.
 *
 *   3. No configuration / blank / loopback
 *      If UPnP already detected an external IP it is used.  Otherwise several
 *      public IP-echo services are queried in turn.  The watcher re-queries
 *      them periodically so a new ISP assignment is picked up automatically.
 *
 * Because process.env.PUBLIC_ADDRESS is read by voiceHandler at transport-
 * creation time (not cached), updating it here is enough — no mediasoup
 * restart required.
 *
 * Environment variables:
 *   PUBLIC_ADDRESS       IPv4, hostname, or blank (default: blank → auto)
 *   IP_CHECK_INTERVAL    Seconds between IP-change checks (default: 300 = 5 min)
 */

"use strict";

const dns = require("dns").promises;
const https = require("https");

// ─── constants ────────────────────────────────────────────────────────────────

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

const LOOPBACK = new Set([
  "",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
]);

// Public IP-echo services tried in order.  All return the bare IP as plain text.
const IP_APIS = [
  "https://api.ipify.org",
  "https://icanhazip.com",
  "https://checkip.amazonaws.com",
  "https://api4.my-ip.io/ip",
];

const POLL_INTERVAL_MS =
  parseInt(process.env.IP_CHECK_INTERVAL || "300", 10) * 1000;

// ─── module state ─────────────────────────────────────────────────────────────

/** How we resolved the IP: "static" | "ddns" | "api"  */
let _mode = "static";

/** Original DDNS hostname (when mode === "ddns"). */
let _ddnsHost = null;

/** setInterval handle for the watcher. */
let _watchTimer = null;

// ─── helpers ──────────────────────────────────────────────────────────────────

function isLoopback(v) {
  return LOOPBACK.has((v || "").trim().toLowerCase());
}

function isIpv4(v) {
  return IPV4_RE.test((v || "").trim());
}

/** Fetch the body of an HTTPS URL as a string (no dependencies). */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body.trim()));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/** Query each IP-echo API in turn; return first valid IPv4 response. */
async function queryPublicIp() {
  for (const url of IP_APIS) {
    try {
      const ip = await fetchText(url);
      if (isIpv4(ip)) return ip;
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

/** DNS-resolve a hostname to its first IPv4 address. */
async function resolveHostname(host) {
  try {
    const addrs = await dns.resolve4(host);
    if (addrs && addrs.length > 0) return addrs[0];
  } catch (err) {
    console.warn(`[PublicIP] DNS resolve failed for "${host}": ${err.message}`);
  }
  return null;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Resolve PUBLIC_ADDRESS to a valid bare IPv4 and update process.env.
 *
 * Call this once at startup, AFTER openPorts() so UPnP has had a chance to
 * auto-set the value from the gateway's external IP.
 *
 * @returns {Promise<string>} The resolved IPv4 address.
 */
async function resolvePublicAddress() {
  const raw = (process.env.PUBLIC_ADDRESS || "").trim();

  // ── Case 1: already a valid non-local IPv4 ───────────────────────────────
  // Covers: static VPS IP set in .env, or UPnP just set it above us.
  if (isIpv4(raw) && !isLoopback(raw)) {
    _mode = "static";
    console.log(`[PublicIP] Using configured IPv4: ${raw}`);
    return raw;
  }

  // ── Case 2: looks like a hostname → DDNS ─────────────────────────────────
  if (raw && !isLoopback(raw) && !isIpv4(raw)) {
    _mode = "ddns";
    _ddnsHost = raw;
    console.log(`[PublicIP] DDNS hostname: "${raw}" — resolving to IPv4…`);
    const ip = await resolveHostname(raw);
    if (ip) {
      process.env.PUBLIC_ADDRESS = ip;
      console.log(`[PublicIP] "${raw}" → ${ip}`);
      return ip;
    }
    console.warn(
      `[PublicIP] Could not resolve "${raw}" — falling back to IP discovery.`,
    );
    // fall through to Case 3
  }

  // ── Case 3: blank / loopback / unresolvable DDNS ─────────────────────────
  // UPnP may have already set a good IP for us; check again.
  const afterUpnp = (process.env.PUBLIC_ADDRESS || "").trim();
  if (isIpv4(afterUpnp) && !isLoopback(afterUpnp)) {
    // UPnP provided a good value; poll the API in future checks to detect changes.
    if (_mode !== "ddns") _mode = "api";
    console.log(`[PublicIP] UPnP-detected IP: ${afterUpnp}`);
    return afterUpnp;
  }

  // Last resort: query public IP-echo services.
  _mode = "api";
  console.log("[PublicIP] No address set — querying public IP services…");
  const ip = await queryPublicIp();
  if (ip) {
    process.env.PUBLIC_ADDRESS = ip;
    console.log(`[PublicIP] Auto-detected public IP: ${ip}`);
    return ip;
  }

  console.warn(
    "[PublicIP] ⚠  Could not determine public IP address.\n" +
      "         Voice chat will not work until PUBLIC_ADDRESS is set.\n" +
      "         Set it to your public IPv4 or a DDNS hostname in .env.",
  );
  return process.env.PUBLIC_ADDRESS || "127.0.0.1";
}

/**
 * Start the background IP-change watcher.
 *
 * Every IP_CHECK_INTERVAL seconds the current IP is re-resolved using the
 * same strategy that was used at startup.  If a change is detected,
 * process.env.PUBLIC_ADDRESS is updated immediately — new WebRTC transports
 * created after that moment will advertise the correct ICE candidate without
 * any server restart.
 *
 * No-op when the address is a static IPv4 (will never change).
 */
function startIpWatcher() {
  if (_mode === "static") {
    // Static IPs never change — no polling needed.
    return;
  }

  console.log(
    `[PublicIP] Watcher active — checking every ${POLL_INTERVAL_MS / 1000}s ` +
      `(mode: ${_mode}${_mode === "ddns" ? `, host: ${_ddnsHost}` : ""}).`,
  );

  async function check() {
    let newIp = null;
    try {
      if (_mode === "ddns" && _ddnsHost) {
        newIp = await resolveHostname(_ddnsHost);
      } else {
        newIp = await queryPublicIp();
      }
    } catch (err) {
      console.warn(`[PublicIP] Watcher check failed: ${err.message}`);
      return;
    }

    if (!newIp) return;

    const current = (process.env.PUBLIC_ADDRESS || "").trim();
    if (newIp !== current) {
      console.log(`[PublicIP] IP changed: ${current || "(none)"} → ${newIp}`);
      process.env.PUBLIC_ADDRESS = newIp;
      console.log(
        "[PublicIP] PUBLIC_ADDRESS updated — new voice transports will use the new IP.",
      );
    }
  }

  _watchTimer = setInterval(check, POLL_INTERVAL_MS);
  // Don't let the timer prevent a clean process exit.
  if (_watchTimer.unref) _watchTimer.unref();
}

/** Stop the watcher (called during graceful shutdown). */
function stopIpWatcher() {
  if (_watchTimer) {
    clearInterval(_watchTimer);
    _watchTimer = null;
  }
}

module.exports = { resolvePublicAddress, startIpWatcher, stopIpWatcher };
