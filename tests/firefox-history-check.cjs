// Optional real-browser regression. Start the app and geckodriver before running.
// Z01EXAM_URL=http://localhost:18080 node tests/firefox-history-check.cjs
// DISABLE_NAVIGATION_API=1 repeats the check using only the controlled History API.
const assert = require('node:assert/strict');
const app = process.env.Z01EXAM_URL || 'http://localhost:8080';
const driver = process.env.GECKODRIVER_URL || 'http://localhost:4444';
const disableNavigation = process.env.DISABLE_NAVIGATION_API === '1';
let session;

async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(driver + path, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(35000)
    });
    const {value} = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(value));
    return value;
}
const command = (path, body, method) => request(`/session/${session}${path}`, body, method);
const script = source => command('/execute/sync', {script: source, args: []});
async function wait(source) {
    const until = Date.now() + 25000;
    while (Date.now() < until) {
        if (await script(source)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${source}`);
}
async function start() {
    await wait('return typeof setAppMode === "function"');
    await script('setTrackMode("js"); setAppMode("true-exam");');
    await wait('return !document.getElementById("true-exam-start").disabled');
    const element = await command('/element', {using: 'css selector', value: '#true-exam-start'});
    await command(`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
    await wait('return !document.getElementById("true-exam-header").hidden && !document.getElementById("run-btn").disabled');
}

(async () => {
    try {
        const result = await request('/session', {capabilities: {alwaysMatch: {
            browserName: 'firefox',
            'moz:firefoxOptions': {args: ['-headless'], prefs: disableNavigation ? {'dom.navigation.webidl.enabled': false} : {}}
        }}});
        session = result.sessionId;
        console.log(`Firefox ${result.capabilities.browserVersion}; Navigation API disabled: ${disableNavigation}`);
        await command('/url', {url: app + '/docs/architecture-services.md?history-test'});
        await command('/url', {url: app + '/'});
        if (disableNavigation) assert.equal(await script('return !window.navigation'), true);
        await start();
        const snapshot = `const saved = JSON.parse(localStorage.getItem("z01exam-true-exam-session"));
            return {id: saved.id, endsAt: saved.endsAt, length: history.length,
                code: document.getElementById("code-editor").value};`;
        await script('document.getElementById("code-editor").value="const historyMarker = 42;"; saveTrueExamSession();');
        const original = await script(snapshot);
        await command('/refresh', {});
        await wait('return !!document.getElementById("true-exam-header") && !document.getElementById("true-exam-header").hidden');
        assert.deepEqual(await script(snapshot), original);
        console.log('PASS F5: same UUID, code, deadline and history length');
        await script('document.body.dataset.trueExamCacheProbe="original-document";');
        await command('/back', {});
        await wait('return location.pathname === "/docs/architecture-services.md"');
        assert.deepEqual(await script('return JSON.parse(localStorage.getItem("z01exam-true-exam-session"));'), {
            version: 2, id: original.id, status: 'finished', finishReason: 'abandoned'
        });
        console.log('PASS one Back: previous page reached, UUID abandoned without code');
        await command('/forward', {});
        await wait('return location.pathname === "/" && document.getElementById("code-editor") !== null');
        assert.deepEqual(await script(`return {
            active: !document.getElementById("true-exam-header").hidden,
            code: document.getElementById("code-editor").value};`), {active: false, code: ''});
        console.log('PASS Forward: abandoned exam and code remain absent');
        const cached = await script('return document.body.dataset.trueExamCacheProbe === "original-document"');
        console.log(`Same Document restored from browser cache: ${cached}`);
        await start();
        const fresh = await script(snapshot);
        assert.notEqual(fresh.id, original.id);
        assert.equal(fresh.code, '');
        assert.equal(fresh.length, original.length);
        console.log('PASS fresh exam: new UUID, empty editor, no extra history entry');
        await command('/back', {});
        await wait('return location.pathname === "/docs/architecture-services.md"');
        await command('/url', {url: app + '/'});
        await wait('return document.getElementById("code-editor") !== null && typeof setAppMode === "function"');
        assert.equal(await script('return document.getElementById("true-exam-header").hidden && document.getElementById("code-editor").value === ""'), true);
        console.log('PASS fresh navigation: abandoned session is not recovered');
        // Finalization is distinct from abandonment and replaces the full workspace.
        await start();
        const submittedId = (await script(snapshot)).id;
        async function click(id) {
            const element = await command('/element', {using: 'css selector', value: '#' + id});
            await command(`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
        }
        await click('true-exam-finish');
        assert.match(await command('/alert/text'), /bilan/);
        await command('/alert/accept', {});
        await wait('return !document.getElementById("true-exam-results").hidden');
        const report = await script('return JSON.parse(localStorage.getItem("z01exam-true-exam-report"));');
        assert.equal(report.id, submittedId);
        assert.equal(report.reason, 'submitted_early');
        assert.equal(report.summary.successful, 0);
        assert.equal(report.summary.unattempted, report.exerciseIds.length);
        assert.equal(await script(`return getComputedStyle(document.querySelector('.layout')).display === 'none' &&
            getComputedStyle(document.querySelector('.topbar')).display === 'none' && document.getElementById('code-editor').disabled;`), true);
        console.log('PASS early submission: real confirmation and full-screen report, workspace hidden');
        if (process.env.Z01EXAM_SCREENSHOT) {
            require('node:fs').writeFileSync(process.env.Z01EXAM_SCREENSHOT, Buffer.from(await command('/screenshot'), 'base64'));
        }
        await command('/refresh', {});
        await wait('return !!document.getElementById("true-exam-results") && !document.getElementById("true-exam-results").hidden');
        assert.deepEqual(await script('return JSON.parse(localStorage.getItem("z01exam-true-exam-report"));'), report);
        console.log('PASS report F5: identical UUID, results, completion timestamp and reason');
        await click('true-exam-new');
        await wait('return !document.getElementById("true-exam-preparation").hidden');
        assert.equal(await script('return localStorage.getItem("z01exam-true-exam-session");'), null);
        await start();
        assert.notEqual((await script(snapshot)).id, submittedId);
        assert.equal((await script(snapshot)).code, '');
        await click('true-exam-finish');
        await command('/alert/accept', {});
        await wait('return !document.getElementById("true-exam-results").hidden');
        await click('true-exam-quit');
        await wait('return document.getElementById("true-exam-results").hidden && document.getElementById("mode-exam").checked');
        assert.equal(await script('return JSON.parse(localStorage.getItem("z01exam-true-exam-report")).reason;'), 'submitted_early');
        console.log('PASS report actions: New Exam prepares a fresh session; Quit preserves completion');
    } finally {
        if (session) await command('', undefined, 'DELETE');
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
