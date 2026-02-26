import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { routeLoader$ } from "@builder.io/qwik-city";

// ── icons ─────────────────────────────────────────────────────────────────────

const IconWindows = component$(() => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13 -1.801" />
  </svg>
));

const IconApple = component$(() => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
));

const IconLinux = component$(() => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.alloc3-.546.26-.648.575-.636 1.087.243-.49-.51-.69-.4-1.252.134.048.272.062.41.04.112-.084.189-.197.248-.332.048-.13.068-.271.152-.489.027-.073.056-.158.087-.236.157 0 .315-.002.464-.002.243 0 .479-.02.702-.064.195-.36.33-.08.456-.12.17-.045.32-.09.45-.14.13-.05.24-.106.33-.17.09-.064.15-.133.19-.209.04-.076.065-.162.065-.25 0-.126-.035-.246-.095-.35a.74.74 0 00-.255-.255c-.107-.065-.229-.138-.365-.205.27.076.55.075.796.03.244-.045.473-.124.68-.22.268-.127.498-.282.694-.46.144-.13.275-.273.41-.414.137-.142.279-.284.44-.408l.233-.167a3.04 3.04 0 01.28-.16 2.7 2.7 0 01.325-.126 5.78 5.78 0 01.455-.123c.182-.04.37-.07.555-.089l.01-.002a2.33 2.33 0 01.3-.008c.214.01.417.051.584.115.088.032.167.069.24.11.073.04.14.085.2.133.062.05.117.101.164.156.047.054.085.11.113.166.027.057.043.115.043.174 0 .086-.02.172-.063.25a.58.58 0 01-.166.206.95.95 0 01-.252.15 1.5 1.5 0 01-.308.088 1.993 1.993 0 01-.345.028h-.175a1.6 1.6 0 01-.267-.024c-.082-.015-.158-.038-.227-.067a.786.786 0 01-.176-.104.541.541 0 01-.12-.145.41.41 0 01-.044-.18" />
  </svg>
));

const IconDownload = component$(() => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
));

const IconGithub = component$(() => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
));

const IconServer = component$(() => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
));

// ── version loader ─────────────────────────────────────────────────────────────

export const useLatestVersion = routeLoader$(async () => {
  try {
    const res = await fetch("https://slothvoice.com/updates/latest.yml", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { version: null };
    const text = await res.text();
    const match = text.match(/^version:\s*(.+)$/m);
    return { version: match ? match[1].trim() : null };
  } catch {
    return { version: null };
  }
});

// ── page ──────────────────────────────────────────────────────────────────────

export default component$(() => {
  const versionSig = useLatestVersion();
  const version = versionSig.value.version;
  const verLabel = version ? `v${version}` : "latest";

  const copied = useSignal(false);
  const SERVER_URL = "http://server.slothvoice.com:5000";

  // Detect platform client-side for download highlight
  const platform = useSignal<"win" | "mac" | "linux" | null>(null);
  useVisibleTask$(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) platform.value = "win";
    else if (ua.includes("mac")) platform.value = "mac";
    else if (ua.includes("linux")) platform.value = "linux";
  });

  return (
    <>
      {/* ── nav ── */}
      <header class="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg/90 backdrop-blur">
        <nav class="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <a href="/" class="font-mono text-sm text-text tracking-tight">
            sloth<span class="text-muted">/</span>voice
          </a>
          <div class="flex items-center gap-6 text-sm text-dim">
            <a href="#try" class="hover:text-text transition-colors">
              try it
            </a>
            <a href="#download" class="hover:text-text transition-colors">
              download
            </a>
            <a
              href="https://github.com/ItsAshn/sloth-voice"
            >
              <IconGithub />
              <span class="hidden sm:inline">github</span>
            </a>
          </div>
        </nav>
      </header>

      <main class="max-w-3xl mx-auto px-6 pt-32 pb-24 space-y-28">
        {/* ── hero ── */}
        <section class="space-y-6">
          <div>
            <h1 class="font-mono text-6xl sm:text-7xl font-medium tracking-tight text-bright leading-none">
              sloth
            </h1>
            <p class="font-mono text-6xl sm:text-7xl font-medium tracking-tight text-muted leading-none">
              / voice
            </p>
          </div>
          <p class="text-dim text-lg max-w-md leading-relaxed">
            self-hosted voice &amp; text chat.
            <br />
            your server. your data. no accounts, no telemetry.
          </p>
          <div class="flex flex-wrap items-center gap-4 pt-2">
            <a
              href="#try"
              class="font-mono text-sm border border-border px-4 py-2 hover:border-text hover:text-bright transition-colors"
            >
              → try it
            </a>
            <a
              href="#download"
              class="font-mono text-sm text-dim hover:text-text transition-colors"
            >
              → download {verLabel}
            </a>
          </div>
        </section>

        {/* ── what it is ── */}
        <section class="space-y-6">
          <p class="font-mono text-xs text-muted tracking-widest uppercase">
            what it is
          </p>
          <div class="rule" />
          <ul class="space-y-4 text-sm text-dim leading-relaxed">
            {[
              {
                label: "voice channels",
                desc: "low-latency audio via WebRTC + mediasoup. works on any network.",
              },
              {
                label: "text chat",
                desc: "channels, message history, roles and permissions.",
              },
              {
                label: "self-hosted",
                desc: "one docker command. runs on a raspberry pi or a vps. you own it.",
              },
              {
                label: "open-source",
                desc: "no black boxes. read it, fork it, host it.",
              },
            ].map((f) => (
              <li key={f.label} class="grid grid-cols-[1fr_2fr] gap-4">
                <span class="font-mono text-text">{f.label}</span>
                <span>{f.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── try it ── */}
        <section id="try" class="space-y-6 scroll-mt-20">
          <p class="font-mono text-xs text-muted tracking-widest uppercase">
            try it
          </p>
          <div class="rule" />
          <p class="text-sm text-dim leading-relaxed">
            a public test server is running. open the desktop app, click{" "}
            <span class="font-mono text-text">add server</span>, and paste the
            address below.
          </p>
          <div class="border border-border bg-surface p-4 flex items-center justify-between gap-4 font-mono text-sm">
            <span class="flex items-center gap-2 text-text">
              <IconServer />
              {SERVER_URL}
            </span>
            <button
              class={[
                "text-xs px-3 py-1 border transition-colors",
                copied.value
                  ? "border-text text-bright"
                  : "border-border text-dim hover:border-text hover:text-text",
              ].join(" ")}
              onClick$={async () => {
                await navigator.clipboard.writeText(SERVER_URL);
                copied.value = true;
                setTimeout(() => (copied.value = false), 1500);
              }}
            >
              {copied.value ? "copied" : "copy"}
            </button>
          </div>
          <p class="text-xs text-muted">
            ┌ no invite needed · no registration on the test instance ┐
          </p>
        </section>

        {/* ── download ── */}
        <section id="download" class="space-y-6 scroll-mt-20">
          <div class="flex items-baseline justify-between">
            <p class="font-mono text-xs text-muted tracking-widest uppercase">
              download
            </p>
            {version && (
              <span class="font-mono text-xs text-muted">{verLabel}</span>
            )}
          </div>
          <div class="rule" />
          <p class="text-sm text-dim">
            desktop client for windows, mac, and linux.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Windows */}
            <a
              href={
                version
                  ? `/updates/Sloth-Voice-Setup-${version}.exe`
                  : "/updates/"
              }
              class={[
                "border p-4 space-y-3 transition-colors group",
                platform.value === "win"
                  ? "border-text"
                  : "border-border hover:border-dim",
              ].join(" ")}
            >
              <div class="flex items-center justify-between text-dim group-hover:text-text transition-colors">
                <IconWindows />
                <IconDownload />
              </div>
              <p class="font-mono text-sm text-text">windows</p>
              <p class="text-xs text-muted">.exe · nsis installer</p>
            </a>

            {/* macOS */}
            <a
              href={
                version ? `/updates/Sloth-Voice-${version}.dmg` : "/updates/"
              }
              class={[
                "border p-4 space-y-3 transition-colors group",
                platform.value === "mac"
                  ? "border-text"
                  : "border-border hover:border-dim",
              ].join(" ")}
            >
              <div class="flex items-center justify-between text-dim group-hover:text-text transition-colors">
                <IconApple />
                <IconDownload />
              </div>
              <p class="font-mono text-sm text-text">macos</p>
              <p class="text-xs text-muted">.dmg · universal</p>
            </a>

            {/* Linux */}
            <a
              href={
                version
                  ? `/updates/Sloth-Voice-${version}.AppImage`
                  : "/updates/"
              }
              class={[
                "border p-4 space-y-3 transition-colors group",
                platform.value === "linux"
                  ? "border-text"
                  : "border-border hover:border-dim",
              ].join(" ")}
            >
              <div class="flex items-center justify-between text-dim group-hover:text-text transition-colors">
                <IconLinux />
                <IconDownload />
              </div>
              <p class="font-mono text-sm text-text">linux</p>
              <p class="text-xs text-muted">.appimage</p>
            </a>
          </div>
          <p class="text-xs text-muted">
            the app checks for updates automatically on launch.
          </p>
        </section>

        {/* ── self-host ── */}
        <section class="space-y-6">
          <p class="font-mono text-xs text-muted tracking-widest uppercase">
            self-host
          </p>
          <div class="rule" />
          <p class="text-sm text-dim leading-relaxed max-w-lg">
            run your own instance in under two minutes.
          </p>
          <pre class="bg-surface border border-border p-4 font-mono text-xs text-text overflow-x-auto leading-relaxed">
            {`git clone https://github.com/ItsAshn/sloth-voice-server
cd sloth-voice-server
cp .env.example .env
# set JWT_SECRET in .env
docker compose up -d`}
          </pre>
          <a
            href="https://github.com/ItsAshn/sloth-voice-server"
          >
            <IconGithub />→ server repo &amp; docs
          </a>
        </section>
      </main>

      {/* ── footer ── */}
      <footer class="border-t border-border">
        <div class="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted font-mono">
          <span>sloth / voice</span>
          <div class="flex items-center gap-6">
            <a
              href="https://github.com/ItsAshn/sloth-voice"
            >
              github
            </a>
            <span>built with qwik</span>
          </div>
        </div>
      </footer>
    </>
  );
});

export const head: DocumentHead = {
  title: "sloth / voice",
  meta: [
    {
      name: "description",
      content:
        "self-hosted voice & text chat. your server, your data. no accounts, no telemetry.",
    },
    { name: "og:title", content: "sloth / voice" },
    {
      name: "og:description",
      content: "self-hosted voice & text chat. your server, your data.",
    },
    { name: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
};
