// Tests de la logique d'alerte : `node --test monitoring/uptime`
import test from "node:test";
import assert from "node:assert/strict";
import { monitor, SMS_COOLDOWN_MS } from "./worker.js";

const MIN = 60 * 1000;

// harness simule le site, les corrections et les canaux d'alerte.
function harness() {
  const store = new Map();
  const sent = [];
  const site = { up: true, run: "ok" }; // run : ok | broken | slow | 504
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/version")) {
      if (!site.up) throw new Error("connexion refusée");
      return Response.json({ sha: "abc" });
    }
    if (u.includes("/api/run")) {
      if (site.run === "504") return new Response("", { status: 504 });
      if (site.run === "ok") return Response.json({ success: true, output: "OK" });
      const output = site.run === "slow" ? "Échec moulinette Go officielle: context deadline exceeded" : "failed to connect to the docker API";
      return Response.json({ success: false, output });
    }
    sent.push(u.includes("discord") ? "discord" : u.includes("free-mobile") ? "sms" : u);
    return new Response("ok");
  };
  const env = {
    TARGET_URL: "https://site",
    STATE: { get: async (k) => store.get(k) ?? null, put: async (k, v) => store.set(k, v) },
    DISCORD_WEBHOOK_URL: "https://discord/x",
    FREE_SMS_USER: "u",
    FREE_SMS_PASS: "p",
  };
  let now = Date.UTC(2026, 9, 20, 10, 0);
  return {
    site,
    sent,
    store,
    // tick : une minute ; withRun : contrôle de la correction (toutes les 5 min).
    async tick(withRun = false, advance = MIN) {
      now += advance;
      sent.length = 0;
      await monitor(env, withRun, now);
      return [...sent];
    },
  };
}

test("site en ligne : rien", async () => {
  const h = harness();
  for (let i = 0; i < 6; i++) assert.deepEqual(await h.tick(i % 5 === 0), []);
});

test("site injoignable : alerte (SMS) au 3e échec, pas de doublon", async () => {
  const h = harness();
  h.site.up = false;
  assert.deepEqual(await h.tick(), []);
  assert.deepEqual(await h.tick(), []);
  assert.deepEqual(await h.tick(), ["discord", "sms"]);
  for (let i = 0; i < 20; i++) assert.deepEqual(await h.tick(), []);
});

test("un échec isolé du site ne s'additionne pas aux suivants", async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) {
    h.site.up = false;
    assert.deepEqual(await h.tick(), []);
    h.site.up = true;
    assert.deepEqual(await h.tick(), []);
  }
});

test("rétabli : 2 succès, par SMS seulement si la panne a duré", async () => {
  const h = harness();
  h.site.up = false;
  for (let i = 0; i < 3; i++) await h.tick(); // alerte
  h.site.up = true;
  assert.deepEqual(await h.tick(), [], "1 succès : pas encore rétabli");
  assert.deepEqual(await h.tick(), ["discord"], "panne courte : Discord seulement");

  await h.tick(false, 40 * MIN); // hors du délai anti-rebond
  h.site.up = false;
  for (let i = 0; i < 3; i++) await h.tick(false, 5 * MIN);
  h.site.up = true;
  await h.tick();
  assert.deepEqual(await h.tick(), ["discord", "sms"], "panne de plus de 10 min : SMS aussi");
});

test("corrections lentes : Discord seulement, jamais de SMS, même en boucle", async () => {
  const h = harness();
  h.site.run = "slow";
  assert.deepEqual(await h.tick(true, 5 * MIN), []);
  assert.deepEqual(await h.tick(true, 5 * MIN), []);
  assert.deepEqual(await h.tick(true, 5 * MIN), ["discord"]);
  assert.deepEqual(await h.tick(true, 5 * MIN), []);
  h.site.run = "ok";
  assert.deepEqual(await h.tick(true, 5 * MIN), []);
  assert.deepEqual(await h.tick(true, 5 * MIN), ["discord"], "rétabli sans SMS");
});

test("serveur ralenti qui oscille : aucun SMS", async () => {
  const h = harness();
  const all = [];
  for (let i = 0; i < 40; i++) {
    h.site.run = i % 3 === 0 ? "504" : "ok";
    all.push(...(await h.tick(true, 5 * MIN)));
  }
  assert.ok(!all.includes("sms"), `SMS inattendus : ${all}`);
});

test("corrections cassées : SMS au 2e contrôle", async () => {
  const h = harness();
  h.site.run = "broken";
  assert.deepEqual(await h.tick(true, 5 * MIN), []);
  assert.deepEqual(await h.tick(true, 5 * MIN), ["discord", "sms"]);
  assert.deepEqual(await h.tick(true, 5 * MIN), []);
});

test("lent puis cassé : une alerte de plus, avec SMS", async () => {
  const h = harness();
  h.site.run = "slow";
  for (let i = 0; i < 3; i++) await h.tick(true, 5 * MIN);
  h.site.run = "broken";
  assert.deepEqual(await h.tick(true, 5 * MIN), ["discord", "sms"]);
});

test("anti-rebond : pas plus d'un SMS par type de panne en 30 minutes", async () => {
  const h = harness();
  h.site.up = false;
  for (let i = 0; i < 3; i++) await h.tick();
  h.site.up = true;
  await h.tick();
  await h.tick(); // rétabli
  h.site.up = false;
  await h.tick();
  await h.tick();
  const third = await h.tick();
  assert.deepEqual(third, ["discord"], "nouvelle panne trop proche : Discord seulement");
  assert.ok(SMS_COOLDOWN_MS >= 30 * MIN);
});

test("l'état n'est écrit que s'il change", async () => {
  const h = harness();
  await h.tick(); // première écriture de l'état
  let writes = 0;
  const put = h.store.set.bind(h.store);
  h.store.set = (k, v) => (writes++, put(k, v));
  for (let i = 0; i < 10; i++) await h.tick(i % 5 === 0);
  assert.equal(writes, 0);
});

test("ancien format d'état : repart de zéro", async () => {
  const h = harness();
  h.store.set("state", JSON.stringify({ failures: 2, alerted: true, since: 1, lastProblem: "x", runFailing: false }));
  assert.deepEqual(await h.tick(), []);
});
