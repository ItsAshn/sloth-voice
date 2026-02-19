const mediasoup = require("mediasoup");
const os = require("os");

let worker = null;

async function createWorker() {
  worker = await mediasoup.createWorker({
    logLevel: process.env.MEDIASOUP_LOG_LEVEL || "warn",
    rtcMinPort: parseInt(process.env.RTC_MIN_PORT || "40000", 10),
    rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || "49999", 10),
  });

  console.log(`✅ mediasoup worker created [pid ${worker.pid}]`);

  worker.on("died", (err) => {
    console.error("mediasoup worker died — restarting in 2s", err);
    setTimeout(createWorker, 2000);
  });

  return worker;
}

function getWorker() {
  if (!worker) throw new Error("mediasoup worker not initialized");
  return worker;
}

module.exports = { createWorker, getWorker };
