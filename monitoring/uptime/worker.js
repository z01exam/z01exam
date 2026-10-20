// Surveillance de z01exam.online, hébergée hors du VPS (Cloudflare Workers).
//
// Toutes les minutes : le site répond-il ? Toutes les 5 minutes : une vraie
// correction Go réussit-elle (Docker, moulinettes) ? Après FAILURES_BEFORE_ALERT
// échecs consécutifs, alerte Discord, e-mail et SMS ; au retour, message
// « rétabli » avec la durée de la panne. Chaque canal est facultatif : un
// secret absent désactive son canal.

const FAILURES_BEFORE_ALERT = 2;
const TIMEOUT_MS = 15000;
const RUN_TIMEOUT_MS = 60000;

// Plus petit programme accepté par la moulinette de l'exercice « onlya ».
const RUN_PAYLOAD = JSON.stringify({
  exerciseId: "onlya",
  code: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Print("a") }\n',
});

export default {
  async scheduled(event, env, ctx) {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    ctx.waitUntil(monitor(env, minute % 5 === 0));
  },
};

async function monitor(env, withRun) {
  const { problem, fromRun } = await check(env.TARGET_URL, withRun);
  const state = await loadState(env);
  const now = Date.now();

  // Une panne des corrections n'est levée que par une correction réussie,
  // pas par le simple ping des minutes intermédiaires.
  if (!problem && !withRun && state.runFailing) return;

  if (problem) {
    state.failures += 1;
    state.lastProblem = problem;
    state.since ??= now;
    state.runFailing = fromRun;
    if (state.failures >= FAILURES_BEFORE_ALERT && !state.alerted) {
      await notify(env, `🔴 z01exam.online en panne`, `${problem}\nDepuis ${formatTime(state.since)}.`);
      state.alerted = true;
    }
    await saveState(env, state);
    return;
  }

  if (state.alerted) {
    await notify(env, `🟢 z01exam.online rétabli`, `Panne de ${formatDuration(now - state.since)} (${state.lastProblem}).`);
  }
  if (state.failures > 0) {
    await saveState(env, emptyState());
  }
}

// check renvoie la raison de l'échec (null si tout va bien) et si elle
// vient de la correction.
async function check(target, withRun) {
  const problem = await checkVersion(target);
  if (problem || !withRun) return { problem, fromRun: false };
  const runProblem = await checkRun(target);
  return { problem: runProblem, fromRun: runProblem !== null };
}

async function checkVersion(target) {
  try {
    const res = await fetch(`${target}/api/version`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return `Le site répond HTTP ${res.status} sur /api/version.`;
    const body = await res.json();
    if (!body.sha) return "Réponse inattendue de /api/version.";
  } catch (err) {
    return `Le site ne répond pas (${err.name === "TimeoutError" ? "délai dépassé" : err.message}).`;
  }
  return null;
}

async function checkRun(target) {
  try {
    const res = await fetch(`${target}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: RUN_PAYLOAD,
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });
    if (!res.ok) return `Les corrections échouent : HTTP ${res.status} sur /api/run.`;
    const body = await res.json();
    if (!body.success) return `Les corrections échouent : ${String(body.output).slice(0, 200)}`;
  } catch (err) {
    return `Les corrections ne répondent pas (${err.name === "TimeoutError" ? "délai dépassé" : err.message}).`;
  }
  return null;
}

async function loadState(env) {
  const saved = await env.STATE.get("state", "json");
  return saved ?? emptyState();
}

function emptyState() {
  return { failures: 0, alerted: false, since: null, lastProblem: null, runFailing: false };
}

function saveState(env, state) {
  return env.STATE.put("state", JSON.stringify(state));
}

// notify envoie sur chaque canal configuré ; un canal en échec n'empêche
// pas les autres.
async function notify(env, title, details) {
  const text = `${title}\n${details}`;
  const sends = [];
  if (env.DISCORD_WEBHOOK_URL) {
    const mention = env.DISCORD_USER_ID ? `<@${env.DISCORD_USER_ID}> ` : "";
    sends.push(post(env.DISCORD_WEBHOOK_URL, {
      content: `${mention}**${title}**\n${details}`,
      allowed_mentions: { users: env.DISCORD_USER_ID ? [env.DISCORD_USER_ID] : [] },
    }));
  }
  if (env.RESEND_API_KEY && env.ALERT_EMAIL) {
    sends.push(post("https://api.resend.com/emails", {
      from: "Z01EXAM <onboarding@resend.dev>",
      to: [env.ALERT_EMAIL],
      subject: title,
      text,
    }, { Authorization: `Bearer ${env.RESEND_API_KEY}` }));
  }
  if (env.FREE_SMS_USER && env.FREE_SMS_PASS) {
    const url = new URL("https://smsapi.free-mobile.fr/sendmsg");
    url.searchParams.set("user", env.FREE_SMS_USER);
    url.searchParams.set("pass", env.FREE_SMS_PASS);
    url.searchParams.set("msg", text);
    sends.push(fetch(url).then((res) => { if (!res.ok) throw new Error(`SMS : HTTP ${res.status}`); }));
  }
  const results = await Promise.allSettled(sends);
  for (const r of results) {
    if (r.status === "rejected") console.error("alerte non envoyée :", r.reason?.message ?? r.reason);
  }
}

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} : HTTP ${res.status}`);
}

function formatTime(ms) {
  return new Date(ms).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
}

function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}
