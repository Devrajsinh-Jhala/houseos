// Run explicitly with: node --test scripts/check-precache.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { runInNewContext } from "node:vm";
import { generatePrecache } from "./precache.mjs";

async function fixture(t) {
  const tempRoot = resolve(tmpdir());
  const distPath = await mkdtemp(join(tempRoot, "houseos-precache-"));
  t.after(async () => {
    if (!resolve(distPath).startsWith(`${tempRoot}${sep}houseos-precache-`)) throw new Error("Unexpected fixture path");
    await rm(distPath, { recursive: true, force: true });
  });
  await mkdir(join(distPath, "assets"));
  const files = {
    "index.html": '<script src="/houseos/assets/app-a.js"></script>',
    "assets/app-a.js": 'console.log("home")',
    "assets/app-b.css": "body { color: green; }",
    "assets/app-a.js.map": "{}",
    "manifest.webmanifest": '{"name":"HouseOS"}',
    "icon-192.png": "fixture-icon",
  };
  for (const [file, contents] of Object.entries(files)) await writeFile(join(distPath, file), contents);
  const result = await generatePrecache({ distPath });
  return { distPath, result, worker: await readFile(join(distPath, "sw.js"), "utf8") };
}

function runtime(source, overrides = {}) {
  const handlers = new Map();
  const state = { stored: [], deleted: [], requested: [], claimed: false, skipped: false };
  const cache = {
    match: async () => undefined,
    put: async (...args) => { state.stored.push(args); },
    addAll: async (requests) => { state.requested.push(...requests); },
    ...overrides.cache,
  };
  const scope = overrides.scope ?? "https://home.test/houseos/";
  const self = {
    registration: { scope },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: async () => { state.skipped = true; },
    clients: { claim: async () => { state.claimed = true; } },
  };
  const caches = {
    open: async () => cache,
    keys: async () => overrides.keys ?? [],
    delete: async (name) => { state.deleted.push(name); return true; },
  };
  runInNewContext(source, { self, caches, URL, Request, Response, fetch: overrides.fetch ?? (async () => { throw new Error("offline"); }) });
  return {
    state,
    async lifecycle(name) {
      let pending;
      handlers.get(name)({ waitUntil: (promise) => { pending = promise; } });
      return pending;
    },
    async request(request) {
      let response;
      handlers.get("fetch")({ request, respondWith: (promise) => { response = promise; } });
      return response;
    },
  };
}

test("manifest includes the complete hashed build and changes only with build inputs", async (t) => {
  const { distPath, result, worker } = await fixture(t);
  assert.ok(result.paths.includes("./assets/app-a.js"));
  assert.ok(result.paths.includes("./assets/app-b.css"));
  assert.ok(result.paths.includes("./icon-192.png"));
  assert.ok(result.paths.includes("./manifest.webmanifest"));
  assert.ok(!result.paths.some((path) => path.endsWith(".map") || path.endsWith("sw.js")));
  assert.ok(!worker.includes("__HOUSEOS_"));
  assert.equal((await generatePrecache({ distPath })).buildId, result.buildId);
  await writeFile(join(distPath, "assets/app-a.js"), "changed()");
  assert.notEqual((await generatePrecache({ distPath })).buildId, result.buildId);
});

test("install preloads all resources under the service-worker scope", async (t) => {
  const { worker, result } = await fixture(t);
  const app = runtime(worker);
  await app.lifecycle("install");
  assert.equal(app.state.requested.length, result.paths.length);
  assert.ok(app.state.requested.some((request) => request.url === "https://home.test/houseos/assets/app-a.js"));
  assert.ok(app.state.requested.every((request) => request.cache === "reload"));
  assert.equal(app.state.skipped, true);
});

test("a failed precache never activates an incomplete version", async (t) => {
  const { worker } = await fixture(t);
  const app = runtime(worker, { cache: { addAll: async () => { throw new Error("404"); } } });
  await assert.rejects(app.lifecycle("install"), /404/);
  assert.equal(app.state.skipped, false);
  assert.equal(app.state.deleted.length, 1);
});

test("activation removes only older caches owned by this app scope", async (t) => {
  const { worker, result } = await fixture(t);
  const old = "houseos-shell:https://home.test/houseos/:old";
  const unrelated = "houseos-shell:https://home.test/another/:old";
  const current = `houseos-shell:https://home.test/houseos/:${result.buildId}`;
  const app = runtime(worker, { keys: [old, unrelated, current, "another-app"] });
  await app.lifecycle("activate");
  assert.deepEqual(app.state.deleted, [old]);
  assert.equal(app.state.claimed, true);
});

test("offline navigation serves the complete cached HTML version", async (t) => {
  const { worker } = await fixture(t);
  const app = runtime(worker, { cache: { match: async (url) => url.endsWith("index.html") ? new Response("cached home") : undefined } });
  const response = await app.request({ method: "GET", mode: "navigate", url: "https://home.test/houseos/chores" });
  assert.equal(await response.text(), "cached home");
});

test("offline module requests match precached static responses with Vary: Origin", async (t) => {
  const { worker } = await fixture(t);
  const url = "https://home.test/houseos/assets/app-a.js";
  const precacheRequest = new Request(url);
  const cachedResponse = new Response("cached module", {
    headers: { "Content-Type": "application/javascript", "Vary": "Origin" },
  });
  const browserRequest = new Request(url, { headers: { Origin: "https://home.test" } });
  const match = async (request, options = {}) => {
    const incoming = typeof request === "string" ? new Request(request) : request;
    if (incoming.url !== precacheRequest.url) return undefined;
    const vary = cachedResponse.headers.get("Vary").split(",").map((name) => name.trim());
    if (!options.ignoreVary && vary.some((name) => incoming.headers.get(name) !== precacheRequest.headers.get(name))) return undefined;
    return cachedResponse.clone();
  };
  // Demonstrate the real Cache API mismatch that the static worker must avoid.
  assert.equal(await match(browserRequest), undefined);
  let networkAttempts = 0;
  const app = runtime(worker, {
    cache: { match },
    fetch: async () => { networkAttempts++; throw new Error("offline"); },
  });
  const response = await app.request(browserRequest);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "cached module");
  assert.equal(networkAttempts, 0);
});

test("failed HTTP responses are never cached and network failures return 503", async (t) => {
  const { worker } = await fixture(t);
  const app = runtime(worker, { fetch: async () => new Response("not found", { status: 404 }) });
  const request = new Request("https://home.test/houseos/assets/app-a.js");
  assert.equal((await app.request(request)).status, 404);
  assert.equal(app.state.stored.length, 0);
  assert.equal((await runtime(worker).request(request)).status, 503);
});

test("cache quota errors preserve good network responses and unrelated requests bypass the worker", async (t) => {
  const { worker } = await fixture(t);
  const app = runtime(worker, { cache: { put: async () => { throw new Error("quota"); } }, fetch: async () => new Response("good asset") });
  assert.equal(await (await app.request(new Request("https://home.test/houseos/assets/app-a.js"))).text(), "good asset");
  assert.equal(await app.request(new Request("https://home.test/houseos/api/private")), undefined);
  assert.equal(await app.request(new Request("https://elsewhere.test/asset.js")), undefined);
  assert.equal(await app.request(new Request("https://home.test/houseos/", { method: "POST" })), undefined);
});
