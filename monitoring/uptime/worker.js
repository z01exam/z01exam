// Surveillance de z01exam.online, hébergée hors du VPS (Cloudflare Workers).
//
// Toutes les minutes : le site répond-il ? Toutes les 5 minutes : une vraie
// correction Go réussit-elle (Docker, moulinettes) ? Un ralentissement n'est
// pas une panne : seules les pannes confirmées envoient un SMS.
//
//   site   injoignable                    3 min de suite   Discord + e-mail + SMS
//   cassé  corrections en erreur          2 contrôles      Discord + e-mail + SMS
//   lent   corrections qui dépassent le   3 contrôles      Discord + e-mail
//          délai (504, délai dépassé)
//
// « Rétabli » demande 2 succès de suite ; il part par SMS seulement si la
// panne avait envoyé un SMS et duré assez longtemps. Pas plus d'un SMS par
// type de panne toutes les 30 minutes. Chaque canal est facultatif : un
// secret absent désactive son canal.

export const SITE_FAILURES = 3;
export const RUN_FAILURES = { broken: 2, slow: 3 };
export const RECOVERY_SUCCESSES = 2;
export const SMS_MIN_OUTAGE_MS = 10 * 60 * 1000;
export const SMS_COOLDOWN_MS = 30 * 60 * 1000;

const PING_TIMEOUT_MS = 15000;
const RUN_TIMEOUT_MS = 70000;

// Plus petit programme accepté par la moulinette de l'exercice « onlya ».
const RUN_PAYLOAD = JSON.stringify({
  exerciseId: "onlya",
  code: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Print("a") }\n',
});

export default {
  async scheduled(event, env, ctx) {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    ctx.waitUntil(monitor(env, minute % 5 === 0, event.scheduledTime));
  },
};

export async function monitor(env, withRun, now = Date.now()) {
  const before = await env.STATE.get("state");
  const state = parseState(before);

  await step(env, state.site, "site", await checkSite(env.TARGET_URL), now);
  if (withRun) {
    await step(env, state.run, "run", await checkRun(env.TARGET_URL), now);
  }

  const after = JSON.stringify(state);
  if (after !== before) await env.STATE.put("state", after);
}

// step fait avancer l'état d'un type de panne avec le résultat d'un contrôle
// (null si tout va bien) et envoie les alertes qui en découlent.
async function step(env, s, kind, problem, now) {
  if (problem) {
    s.successes = 0;
    s.failures += 1;
    s.since ??= now;
    s.last = problem.message;
    const level = LEVELS[problem.severity];
    const needed = kind === "site" ? SITE_FAILURES : RUN_FAILURES[problem.severity];
    if (s.failures >= needed && level > s.alerted) {
      const sms = problem.severity !== "slow" && now - s.lastSms >= SMS_COOLDOWN_MS;
      await notify(env, title(problem), `${problem.message}\nDepuis ${formatTime(s.since)}.`, sms);
      s.alerted = level;
      if (sms) {
        s.smsSent = true;
        s.lastSms = now;
      }
    }
    return;
  }

  if (s.failures === 0) return;
  // Sans alerte envoyée, un seul succès suffit : des échecs espacés ne
  // s'additionnent pas. Après une alerte, il en faut plusieurs de suite.
  if (s.alerted) {
    s.successes += 1;
    if (s.successes < RECOVERY_SUCCESSES) return;
    const duration = now - s.since;
    const sms = s.smsSent && duration >= SMS_MIN_OUTAGE_MS;
    await notify(env, `🟢 ${label(kind)} rétabli`, `Panne de ${formatDuration(duration)} (${s.last}).`, sms);
  }
  Object.assign(s, emptyKind(), { lastSms: s.lastSms });
}

// Niveau d'une alerte : on n'en renvoie une que si la panne s'aggrave
// (lent → cassé), jamais pour répéter la même.
const LEVELS = { slow: 1, broken: 2, down: 2 };

function title(problem) {
  if (problem.severity === "down") return "🔴 z01exam.online injoignable";
  if (problem.severity === "broken") return "🔴 Corrections de z01exam.online en panne";
  return "🟠 Corrections de z01exam.online lentes";
}

const label = (kind) => (kind === "site" ? "z01exam.online" : "Corrections de z01exam.online");

// Un contrôle renvoie null s'il réussit, sinon { severity, message }.
async function checkSite(target) {
  try {
    const res = await fetch(`${target}/api/version`, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) return { severity: "down", message: `Le site répond HTTP ${res.status} sur /api/version.` };
    const body = await res.json();
    if (!body.sha) return { severity: "down", message: "Réponse inattendue de /api/version." };
  } catch (err) {
    return { severity: "down", message: `Le site ne répond pas (${describe(err)}).` };
  }
  return null;
}

// Lent : le serveur n'a pas eu le temps de répondre (hébergeur ralenti).
// Cassé : il a répondu, et la correction ne marche pas.
async function checkRun(target) {
  let res;
  try {
    res = await fetch(`${target}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: RUN_PAYLOAD,
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });
  } catch (err) {
    const slow = err.name === "TimeoutError";
    return { severity: slow ? "slow" : "broken", message: `Les corrections ne répondent pas (${describe(err)}).` };
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return { severity: "slow", message: `Les corrections dépassent le délai (HTTP ${res.status}).` };
  }
  if (!res.ok) return { severity: "broken", message: `Les corrections échouent : HTTP ${res.status} sur /api/run.` };
  const body = await res.json().catch(() => ({}));
  if (body.success) return null;
  const output = String(body.output ?? "").slice(0, 200);
  const slow = /deadline|temps limite|time ?out|timed out/i.test(output);
  return { severity: slow ? "slow" : "broken", message: `Les corrections échouent : ${output}` };
}

const describe = (err) => (err.name === "TimeoutError" ? "délai dépassé" : err.message);

function emptyKind() {
  return { failures: 0, successes: 0, since: null, last: null, alerted: 0, smsSent: false, lastSms: 0 };
}

function parseState(raw) {
  let saved = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {}
  // Un état d'une ancienne version (sans « site » ni « run ») repart de zéro.
  return { site: { ...emptyKind(), ...saved?.site }, run: { ...emptyKind(), ...saved?.run } };
}

// notify envoie sur chaque canal configuré ; un canal en échec n'empêche
// pas les autres. Le SMS n'est envoyé que si sms est vrai.
async function notify(env, title, details, sms) {
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
  if (sms && env.FREE_SMS_USER && env.FREE_SMS_PASS) {
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
