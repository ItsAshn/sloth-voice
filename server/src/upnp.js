/**
 * UPnP port mapper — automatically opens ports on the local router if UPnP/IGD
 * is available.  Runs gracefully: if UPnP is not supported or the router
 * refuses, it just logs a warning and the server continues normally.
 *
 * When the configured RTC range is larger than UPNP_RTC_MAX_PORTS, the range
 * is automatically clamped to that many ports starting from RTC_MIN_PORT.
 * The effective (possibly clamped) range is returned from openPorts() so
 * that mediasoup can be started with the same range that UPnP will map.
 *
 * Environment variables:
 *   UPNP_ENABLED         Set to "false" to disable (default: "true")
 *   UPNP_TTL             Lease time in seconds; 0 = indefinite (default: 0)
 *   UPNP_RTC_MAX_PORTS   Max RTC UDP ports to map; the RTC range is clamped
 *                        to this size when UPnP is active. (default: 50)
 */

"use strict";

const natUpnp = require("nat-upnp");

const UPNP_ENABLED =
  (process.env.UPNP_ENABLED || "true").toLowerCase() !== "false";
const TTL = parseInt(process.env.UPNP_TTL || "0", 10);
const RTC_MAX_PORTS = parseInt(process.env.UPNP_RTC_MAX_PORTS || "50", 10);

// Tracks every mapping we successfully opened so we can clean up on exit.
const openedMappings = [];

// ─── helpers ──────────────────────────────────────────────────────────────────

function createClient() {
  return natUpnp.createClient();
}

// Returns true on success, false on failure. Never logs — let the caller decide.
function mapPort(client, port, protocol, description) {
  return new Promise((resolve) => {
    client.portMapping(
      { public: port, private: port, ttl: TTL, protocol, description },
      (err) => {
        if (err) {
          resolve(false);
        } else {
          openedMappings.push({ port, protocol });
          resolve(true);
        }
      },
    );
  });
}

function unmapPort(client, port, protocol) {
  return new Promise((resolve) => {
    client.portUnmapping({ public: port, protocol }, (err) => {
      if (err) {
        console.warn(
          `[UPnP] Failed to unmap ${protocol} ${port}: ${err.message || err}`,
        );
      }
      resolve();
    });
  });
}

function getExternalIp(client) {
  return new Promise((resolve) => {
    client.externalIp((err, ip) => resolve(err ? null : ip));
  });
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Open all required ports via UPnP.
 *
 * @param {object} opts
 * @param {number} opts.httpPort     Main HTTP / WebSocket port (TCP)
 * @param {number} opts.rtcMinPort   mediasoup RTC range start (UDP)
 * @param {number} opts.rtcMaxPort   mediasoup RTC range end   (UDP)
 * @returns {{ effectiveRtcMin: number, effectiveRtcMax: number }}
 *   The RTC range that was actually mapped (may be clamped). Always returned
 *   even when UPnP is disabled or fails, so the caller can pass it on to
 *   mediasoup.
 */
async function openPorts({ httpPort, rtcMinPort, rtcMaxPort }) {
  // ── Clamp RTC range to UPNP_RTC_MAX_PORTS ───────────────────────────────
  const rtcCount = rtcMaxPort - rtcMinPort + 1;
  let effectiveRtcMin = rtcMinPort;
  let effectiveRtcMax = rtcMaxPort;

  if (rtcCount > RTC_MAX_PORTS) {
    effectiveRtcMax = rtcMinPort + RTC_MAX_PORTS - 1;
    console.log(
      `[UPnP] RTC range clamped from ${rtcMinPort}–${rtcMaxPort} → ` +
        `${effectiveRtcMin}–${effectiveRtcMax} (UPNP_RTC_MAX_PORTS=${RTC_MAX_PORTS}).`,
    );
    console.log(
      `[UPnP] mediasoup will also use this narrower range so every port is forwarded.`,
    );
  }

  if (!UPNP_ENABLED) {
    console.log("[UPnP] Disabled via UPNP_ENABLED=false — skipping.");
    return { effectiveRtcMin, effectiveRtcMax };
  }

  console.log("[UPnP] Searching for IGD gateway…");

  const client = createClient();

  try {
    // ── Probe: single TCP mapping to confirm a gateway is reachable ──────────
    const probeOk = await mapPort(client, httpPort, "TCP", "Discard Server HTTP/WS");
    if (!probeOk) {
      console.log(
        "[UPnP] No UPnP gateway found (or port mapping refused) — skipping. " +
          "This is normal on localhost or when UPnP is disabled on your router.",
      );
      return { effectiveRtcMin, effectiveRtcMax };
    }

    // ── RTC ports (UDP) ─────────────────────────────────────────────────────
    const effectiveCount = effectiveRtcMax - effectiveRtcMin + 1;
    console.log(
      `[UPnP] Gateway found — mapping ${effectiveCount} RTC UDP port(s) (${effectiveRtcMin}–${effectiveRtcMax})…`,
    );
    let failed = 0;
    for (let port = effectiveRtcMin; port <= effectiveRtcMax; port++) {
      const ok = await mapPort(client, port, "UDP", `Discard RTC ${port}`);
      if (!ok) failed++;
    }
    if (failed > 0) {
      console.warn(`[UPnP] ${failed} RTC port(s) could not be mapped.`);
    }

    // ── Report external IP if available ─────────────────────────────────────
    const externalIp = await getExternalIp(client);
    if (externalIp) {
      console.log(`[UPnP] External IP : ${externalIp}`);
      console.log(
        `[UPnP] Server reachable at http://${externalIp}:${httpPort}`,
      );
    }

    const mapped = openedMappings.length;
    if (mapped > 0) {
      console.log(`[UPnP] ${mapped} port mapping(s) active.`);
    } else {
      console.log(
        "[UPnP] Gateway found but no ports were mapped (check router UPnP settings).",
      );
    }
  } catch (err) {
    console.warn(`[UPnP] Unexpected error: ${err.message || err}`);
  } finally {
    try { client.close(); } catch (_) { /* already closed */ }
  }

  return { effectiveRtcMin, effectiveRtcMax };
}

/**
 * Remove all previously opened UPnP mappings.  Called automatically on
 * process exit — you can also call it manually.
 */
async function closePorts() {
  if (openedMappings.length === 0) return;

  console.log(`[UPnP] Removing ${openedMappings.length} port mapping(s)…`);

  const client = createClient();
  try {
    for (const { port, protocol } of openedMappings) {
      await unmapPort(client, port, protocol);
    }
    openedMappings.length = 0;
    console.log("[UPnP] Port mappings removed.");
  } catch (err) {
    console.warn(`[UPnP] Error while removing mappings: ${err.message || err}`);
  } finally {
    client.close();
  }
}

// ─── graceful shutdown hook ───────────────────────────────────────────────────

let _shutdownRegistered = false;

function registerShutdownHook() {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;

  async function onExit(signal) {
    console.log(`\n[UPnP] Caught ${signal}, cleaning up port mappings…`);
    await closePorts();
    process.exit(0);
  }

  process.on("SIGINT", () => onExit("SIGINT"));
  process.on("SIGTERM", () => onExit("SIGTERM"));
}

module.exports = { openPorts, closePorts, registerShutdownHook };
