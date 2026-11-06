const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
function testHistory() {
    const entries = [{external: true}, {state: null}];
    let index = 1;
    let backCalls = 0;
    return {
        entries,
        get index() {return index;},
        get state() {return entries[index]?.state ?? null;},
        get length() {return entries.length;},
        get backCalls() {return backCalls;},
        replaceState(state) {entries[index] = {...entries[index], state: structuredClone(state)};},
        pushState(state) {entries.splice(index + 1); entries.push({state: structuredClone(state)}); index++;},
        back() {backCalls++;}, // Browser queues traversal; tests deliver the resulting popstate explicitly.
        move(delta) {index = Math.max(0, Math.min(entries.length - 1, index + delta)); return this.state;}
    };
}

function setup(options = {}) {
    let now = options.now ?? 1000;
    const data = options.data || new Map();
    const history = options.history || testHistory();
    const tabData = options.tabData || new Map();
    const storage = map => ({getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)});
    const listeners = new Map();
    const timeouts = new Map();
    const addEventListener = (name, fn) => {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(fn);
    };
    let uid = 0;
    const intervals = new Map();
    let id = 0;
    const node = () => ({textContent: '', children: [], hidden: true, focus() {},
        replaceChildren(...children) {this.children = children;},
        append(...children) {this.children.push(...children);},
        appendChild(child) {this.children.push(child);}
    });
    const context = vm.createContext({
        makeNode: node,
        window: { confirm: () => true, localStorage: storage(data), sessionStorage: storage(tabData), addEventListener, navigation: options.navigationApi, history },
        crypto: {randomUUID: () => `${options.page || 'page'}-${++uid}`},
        navigator: options.navigator || {},
        performance: { getEntriesByType: () => [{type: options.navigation || 'navigate'}] },
        setTimeout: fn => { timeouts.set(++id, fn); return id; },
        clearTimeout: id => timeouts.delete(id),
        Date: { now: () => now },
        setInterval: fn => { intervals.set(++id, fn); return id; },
        clearInterval: id => intervals.delete(id),
        document: { addEventListener, createElement: node },
    });
    vm.runInContext(`
        const TRUE_EXAM_DURATION_MS = 10800000;
        let trueExamSession = null, trueExamTimerInterval = null;
        let trueExamState = "ready", currentTrack = "go";
        let trueExamMode = true, trueExamSeries = [], trueExamIndex = -1;
        let exercisesLoaded = true, currentExercise = { id: 'test' };
        const trueExamTimerEl = {textContent: ''}, trueExamExpiredEl = {textContent: ''};
        const runBtn = {}, trueExamNextBtn = {}, trueExamRestartBtn = {};
        const trueExamProgressEl = {}, trueExamEditorHintEl = {};
        const trueExamFinishBtn = {}, trueExamResultsEl = makeNode(), trueExamResultsTitleEl = makeNode();
        const trueExamResultStorageEl = makeNode();
        const trueExamResultSummaryEl = makeNode(), trueExamResultStatsEl = makeNode(), trueExamResultRowsEl = makeNode();
        const leftPanel = {scrollTop: 500};
        const editorWrapperEl = {classList: {toggle() {}}};
        const trueExamStartBtn = {}, trueExamPreparationEl = {closest: () => leftPanel}, trueExamPreparationTrackEl = {};
        const trueExamHeaderEl = {}, trueExamHeaderTrackEl = {};
        const trackSwitchEl = {classList: {toggle() {}}}, trackInputs = ['go','js','rust','java'].map(value => ({value}));
        const modeInputs = ['exam','true-exam','learning'].map(value => ({value}));
        const appEl = {classList: {toggle() {}}}, modeSwitchEl = null;
        let learningMode = false, currentLevelFilter = 'all', previousLevelFilter = 'all';
        let goDraft = '', jsDraft = '', rustDraft = '', javaDraft = '';
        const jsDefaultSnippet = '', rustDefaultSnippet = '', javaDefaultSnippet = '';
        const editorTabLabelEl = {};
        function setLearningMode(enabled) {learningMode = enabled; updateModeLabel();}
        function renderLevelFilters() {}
        function updateHighlight() {}
        const outputEl = {textContent: ''}, codeEditorEl = {value: 'code', addEventListener: window.addEventListener};
        const examTitleEl = {}, statementEl = {};
        let available = [{id: 'test'}];
        function isJsTrack() {return currentTrack === 'js';}
        function isRustTrack() {return currentTrack === 'rust';}
        function isJavaTrack() {return currentTrack === 'java';}
        let jsExercises = [{id: 'js'}], exercises = [], rustExercises = [], javaExercises = [];
        function getExerciseLevel() {return 1;}
        function getTrackExercises() {return available;}
        function getFilteredExercises() {return available;}
        function buildTrueExamSeries() {return available;}
        function renderChips() {}
        function setActiveExerciseChip() {}
        function updateExerciseHeader() {}
        function markdownToHtml() {return '';}
        function exStatement() {return '';}
        function highlightMarkdownCode() {}
        function updateTrueExamStatus() {}
        function exId(ex) {return ex.id;}
        function exTitle(ex) {return ex.title || ex.id;}
    `, context);
    const add = (from, to) => vm.runInContext(source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))), context);
    add('// True Exam persistence state', '// End True Exam persistence state');
    add('function createTrueExamResults(', 'function trueExamStorageWarning()');
    add('function trueExamStorageWarning()', 'function stopTrueExamTimer()');
    vm.runInContext('trueExamStorageOwned = true', context); // Existing unit tests invoke the synchronous start after ownership acquisition.
    add('function stopTrueExamTimer()', 'function updateTrueExamStatus(');
    add('function updateTrueExamControls()', 'function setTrueExamMode(');
    add('function hasTrueExamExercises()', 'function normalizeExerciseId(');
    add('function setTrueExamMode(', 'function buildTrueExamSeries(');
    add('function setTrackMode(', 'function stopTrueExamTimer(');
    add('function updateTrackLabel()', 'function setTrackMode(');
    add('function updateModeLabel()', 'function isJsTrack(');
    add('function selectExercise(', 'async function runCode()');
    add('async function runCode()', 'function clearConsole(');
    add('async function loadExercises()', 'function renderLevelFilters(');
    return { run: code => vm.runInContext(code, context), advance: ms => { now += ms; }, intervals, context,
        data, tabData, timeouts, history, fire: async (name, event = {}) => {
            for (const fn of listeners.get(name) || []) await fn(event);
        }, flush: () => { for (const [id, fn] of timeouts) { timeouts.delete(id); fn(); } }
    };
}
test('absolute deadline, throttling, duplicate starts and cleanup', () => {
    const s = setup();
    s.run('startTrueExamSeries()');
    assert.equal(s.run('trueExamTimerEl.textContent'), '03:00:00');
    s.advance(10000);
    s.run('refreshTrueExamTimer()');
    assert.equal(s.run('trueExamTimerEl.textContent'), '02:59:50');
    const session = s.run('trueExamSession');
    for (let i = 0; i < 5; i++) s.run('startTrueExamSeries(); restartTrueExamSeries()');
    assert.equal(s.run('trueExamSession'), session);
    assert.equal(s.intervals.size, 1);
    assert.equal(s.run('trueExamTimerEl.textContent'), '02:59:50');
    s.advance(10800000);
    s.run('refreshTrueExamTimer(); refreshTrueExamTimer()');
    assert.equal(s.run('trueExamTimerEl.textContent'), '00:00:00');
    assert.equal(s.run('runBtn.disabled'), true);
    assert.equal(s.intervals.size, 0);
    s.run('trueExamMode = false; stopTrueExamSeries()');
    assert.equal(s.run('runBtn.disabled'), false);
});
test('unloaded or empty series never starts a clock', () => {
    const s = setup();
    s.run('exercisesLoaded = false; startTrueExamSeries()');
    assert.equal(s.intervals.size, 0);
    s.run('exercisesLoaded = true; available = []; startTrueExamSeries()');
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('runBtn.disabled'), true);
});
test('expired submissions blocked and pending responses ignored', async () => {
    const s = setup();
    let resolve;
    let requests = 0;
    s.context.fetch = () => { requests++; return new Promise(r => { resolve = r; }); };
    s.run('startTrueExamSeries()');
    const pending = s.run('runCode()');
    s.advance(10800000);
    resolve({ ok: true, text: async () => '{"success":true,"output":"late"}' });
    await pending;
    assert.equal(s.run('trueExamState'), 'finished');
    assert.equal(s.run('trueExamSession.finishReason'), 'time_expired');
    assert.equal(s.run('runBtn.disabled'), true);
    assert.notEqual(s.run('outputEl.textContent'), 'late');
    await s.run('runCode()');
    assert.equal(requests, 1);
});
test('late response from a restarted session cannot overwrite the new one', async () => {
    const s = setup();
    let resolve;
    s.context.fetch = () => new Promise(r => { resolve = r; });
    s.run('startTrueExamSeries()');
    const pending = s.run('runCode()');
    s.run('setAppMode("exam"); setAppMode("true-exam")');
    await s.run("requestTrueExamStart()");
    s.run('outputEl.textContent = "new session"');
    resolve({ ok: true, text: async () => '{"success":false,"output":"old session"}' });
    await pending;
    assert.equal(s.run('outputEl.textContent'), 'new session');
    assert.equal(s.intervals.size, 1);
});
test('restored deadline is never extended and pending errors cannot change expiration', async () => {
    const s = setup();
    let reject;
    s.context.fetch = () => new Promise((_, r) => { reject = r; });
    s.run('startTrueExamTimer(0, 5000)');
    assert.equal(s.run('trueExamTimerEl.textContent'), '00:00:04');
    const pending = s.run('runCode()');
    s.advance(5000);
    s.run('refreshTrueExamTimer()');
    reject(new Error('late failure'));
    await pending;
    assert.equal(s.run('trueExamSession.endsAt'), 5000);
    assert.equal(s.run('runBtn.disabled'), true);
    assert.equal(s.intervals.size, 0);
    assert.ok(s.run('trueExamExpiredEl.textContent').includes('terminé'));
});
test('entering True Exam prepares without generating a series or running a clock', async () => {
    const s = setup();
    s.run('trueExamMode = false; setAppMode("true-exam")');
    assert.equal(s.run('trueExamState'), 'ready');
    assert.equal(s.run('trueExamSeries.length'), 0);
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.intervals.size, 0);
    assert.equal(s.run('runBtn.disabled'), true);
    assert.equal(s.run('trueExamPreparationEl.hidden'), false);
    assert.equal(s.run('trueExamHeaderEl.hidden'), true);
    assert.equal(s.run('trackSwitchEl.hidden'), false);
    s.context.fetch = () => { throw new Error('Must not submit during preparation'); };
    await s.run('runCode()');
    s.run('startTrueExamSeries()');
    assert.equal(s.run('trueExamState'), 'running');
    assert.equal(s.run('trueExamHeaderEl.hidden'), false);
    assert.equal(s.run('trueExamPreparationEl.hidden'), true);
    assert.equal(s.run('trackSwitchEl.hidden'), true);
    assert.equal(s.run('trueExamStartBtn.disabled'), true);
    assert.equal(s.run('trueExamNextBtn.hidden && trueExamRestartBtn.hidden'), true);
});
test('all four languages can be chosen during preparation and stay locked while running', () => {
    for (const track of ['go', 'js', 'rust', 'java']) {
        const s = setup();
        s.run(`prepareTrueExam(); setTrackMode('${track}')`);
        assert.equal(s.run('currentTrack'), track);
        assert.equal(s.run('trueExamPreparationTrackEl.textContent'), track.toUpperCase());
        assert.equal(s.intervals.size, 0);
        assert.equal(s.run('trueExamSeries.length'), 0);
        s.run('startTrueExamSeries()');
        const session = s.run('trueExamSession');
        const series = s.run('trueExamSeries');
        s.run('setTrackMode("java"); setTrackMode("go")');
        assert.equal(s.run('currentTrack'), track);
        assert.equal(s.run('trueExamSession.track'), track);
        assert.equal(s.run('trueExamHeaderTrackEl.textContent'), track.toUpperCase());
        assert.equal(s.run('trueExamSession'), session);
        assert.equal(s.run('trueExamSeries'), series);
        assert.equal(s.run('trackInputs.every(input => input.disabled)'), true);
        assert.equal(s.intervals.size, 1);
    }
});
test('leaving for Exam or Learning asks once; cancellation preserves session and selector', () => {
    for (const mode of ['exam', 'learning']) {
        const s = setup();
        let confirmations = 0;
        s.context.window.confirm = () => { confirmations++; return false; };
        s.run('startTrueExamSeries()');
        const session = s.run('trueExamSession');
        const series = s.run('trueExamSeries');
        s.run(`modeInputs.forEach(input => input.checked = input.value === '${mode}'); setAppMode('${mode}')`);
        assert.equal(confirmations, 1);
        assert.equal(s.run('trueExamSession'), session);
        assert.equal(s.run('trueExamSeries'), series);
        assert.equal(s.run('modeInputs.find(input => input.checked).value'), 'true-exam');
        assert.equal(s.intervals.size, 1);
        s.run('setAppMode("true-exam"); startTrueExamSeries()');
        assert.equal(confirmations, 1);
        assert.equal(s.run('trueExamSession'), session);
        s.context.window.confirm = () => { confirmations++; return true; };
        s.run(`setAppMode('${mode}')`);
        assert.equal(confirmations, 2);
        assert.equal(s.intervals.size, 0);
        assert.equal(s.run('trueExamMode'), false);
        assert.equal(s.run('learningMode'), mode === 'learning');
        assert.equal(s.run('runBtn.disabled'), false);
        assert.equal(s.run('trueExamHeaderEl.hidden'), true);
        assert.equal(s.run('trackSwitchEl.hidden'), false);
        s.run('setAppMode("true-exam")');
        assert.equal(s.run('trueExamState'), 'ready');
        assert.equal(s.run('trueExamSession'), null);
        assert.equal(s.intervals.size, 0);
    }
});
test('manual progression stays blocked and accepted success advances to the next exercise', async () => {
    const s = setup();
    s.run('available = [{id: "test"}, {id: "second"}]; startTrueExamSeries()');
    s.run('nextTrueExamExercise(); restartTrueExamSeries(); selectExercise("second")');
    assert.equal(s.run('currentExercise.id'), 'test');
    assert.equal(s.run('trueExamIndex'), 0);
    s.context.fetch = async () => ({ ok: true, text: async () => '{"success":true}' });
    await s.run('runCode()');
    assert.equal(s.run('currentExercise.id'), 'second');
    assert.equal(s.run('trueExamIndex'), 1);
    s.advance(10800000);
    s.run('refreshTrueExamTimer()');
    assert.equal(s.run('trueExamState'), 'finished');
    assert.equal(s.run('trueExamHeaderEl.hidden'), true);
    assert.equal(s.run('runBtn.disabled'), true);
});
test('Exam and Learning changes outside a running exam never ask for confirmation', () => {
    const s = setup();
    s.context.window.confirm = () => { throw new Error('Unexpected confirmation'); };
    s.run('trueExamMode = false; setAppMode("learning"); setAppMode("exam")');
    assert.equal(s.run('learningMode'), false);
    assert.equal(s.run('trueExamMode'), false);
    assert.equal(s.intervals.size, 0);
});

test('catalog loading enables Start without generating a session automatically', async () => {
    const s = setup();
    s.run('exercisesLoaded = false; prepareTrueExam()');
    assert.equal(s.run('trueExamStartBtn.disabled'), true);
    const waiting = [];
    s.context.fetch = () => new Promise(resolve => waiting.push(resolve));
    const loading = s.run('loadExercises()');
    s.run('startTrueExamSeries(); startTrueExamSeries()');
    assert.equal(s.run('trueExamSeries.length'), 0);
    assert.equal(s.intervals.size, 0);
    waiting.forEach(resolve => resolve({ok: true, json: async () => [{id: 'test'}]}));
    await loading;
    assert.equal(s.run('trueExamState'), 'ready');
    assert.equal(s.run('trueExamStartBtn.disabled'), false);
    assert.equal(s.run('trueExamSeries.length'), 0);
    assert.equal(s.intervals.size, 0);
    s.run('startTrueExamSeries()');
    assert.equal(s.intervals.size, 1);
});

test('preparation disables the editor and restores the top of the exercise area', () => {
    const s = setup();
    s.run('codeEditorEl.value = "draft"; prepareTrueExam()');
    assert.equal(s.run('codeEditorEl.disabled'), true);
    assert.equal(s.run('trueExamEditorHintEl.hidden'), false);
    assert.equal(s.run('codeEditorEl.value'), 'draft');
    assert.equal(s.run('statementEl.hidden'), true);
    assert.equal(s.run('trueExamProgressEl.hidden'), true);
    assert.equal(s.run('leftPanel.scrollTop'), 0);
    s.run('startTrueExamSeries()');
    assert.equal(s.run('codeEditorEl.disabled'), false);
    assert.equal(s.run('trueExamEditorHintEl.hidden'), true);
    assert.equal(s.run('statementEl.hidden'), false);
    assert.equal(s.run('trueExamHeaderEl.hidden'), false);
    assert.equal(s.run('trueExamTimerEl.textContent'), '03:00:00');
});
test('compact progress follows the current exercise without manual progression', () => {
    const s = setup();
    s.run('available = Array.from({length: 10}, (_, i) => ({id: "ex-" + i})); startTrueExamSeries()');
    assert.equal(s.run('trueExamProgressEl.hidden'), false);
    assert.equal(s.run('trueExamProgressEl.textContent'), 'Exercice 01 / 10');
    // Simulate an internal exercise change, without adding automatic progression.
    s.run('trueExamIndex = 1; selectExercise("ex-1")');
    assert.equal(s.run('trueExamProgressEl.textContent'), 'Exercice 02 / 10');
    s.run('setAppMode("exam")');
    assert.equal(s.run('trueExamProgressEl.hidden'), true);
    assert.equal(s.run('codeEditorEl.disabled'), false);
    assert.equal(s.run('statementEl.hidden'), false);
});
test('preparation is in the main subject, uses a primary action and has no active panel', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const subject = html.indexOf('<div class="subject">');
    const preparation = html.indexOf('id="true-exam-preparation"');
    const start = html.indexOf('id="true-exam-start"');
    assert.ok(subject < preparation && preparation < start);
    assert.ok(html.includes('id="true-exam-start" class="btn-run"'));
    assert.ok(html.includes('Simulation de checkpoint'));
    assert.ok(!html.includes('class="true-exam-panel"'));
    assert.equal(html.match(/id="true-exam-timer"/g).length, 1);
    assert.ok(html.indexOf('id="true-exam-timer"') < html.indexOf('</header>'));
    assert.ok(html.indexOf('id="true-exam-progress"') < html.indexOf('id="exercise-content"'));
});

const sessionKey = 'z01exam-true-exam-session';
function snapshot(s) { return JSON.parse(s.data.get(sessionKey)); }
function savedExam(track = 'go') {
    const s = setup();
    s.run(`currentTrack = '${track}'; available = Array.from({length: 10}, (_, i) => ({id: 'ex-' + i})); startTrueExamSeries()`);
    s.run('trueExamIndex = 3; selectExercise("ex-3"); codeEditorEl.value = "// exact code\\n\\t<>&\\n"; saveTrueExamSession()');
    return s;
}
async function recover(s, options = {}) {
    const next = setup({data: s.data, now: 1000, page: 'recovered', ...options});
    next.run('trueExamStorageOwned = false; trueExamRecoveryPending = true; available = Array.from({length: 10}, (_, i) => ({id: "ex-" + i}))');
    await next.run('restoreTrueExamSession()');
    return next;
}

test('F5 at 30 minutes restores exercise 4, exact code, ordered selection and original deadline', async () => {
    for (const track of ['go', 'js', 'rust', 'java']) {
        const first = savedExam(track);
        const original = snapshot(first);
        first.advance(30 * 60 * 1000);
        await first.fire('pagehide');
        const next = await recover(first, {tabData: first.tabData, navigation: 'reload', now: 1801000});
        assert.equal(next.run('trueExamState'), 'running', next.run('trueExamExpiredEl.textContent'));
        assert.equal(next.run('trueExamTimerEl.textContent'), '02:30:00');
        assert.equal(next.run('trueExamIndex'), 3);
        assert.equal(next.run('currentExercise.id'), 'ex-3');
        assert.equal(next.run('codeEditorEl.value'), original.code);
        assert.deepEqual(JSON.parse(next.run('JSON.stringify(trueExamSeries.map(exId))')), original.exerciseIds);
        assert.equal(next.run('trueExamSession.id'), original.id);
        assert.equal(next.run('trueExamSession.endsAt'), original.endsAt);
        assert.equal(next.run('trueExamSession.startedAt'), original.startedAt);
        assert.equal(next.run('currentTrack'), track);
        assert.equal(next.run('trackSwitchEl.hidden'), true);
        assert.equal(next.run('trueExamPreparationEl.hidden'), true);
        assert.equal(next.intervals.size, 1);
    }
});

test('detected browser interruptions allow 3 minutes and reject 6, even after another F5', async () => {
    for (const minutes of [3, 6]) {
        const first = savedExam();
        await first.fire('pagehide');
        const next = await recover(first, {now: 1000 + minutes * 60000});
        assert.equal(next.run('trueExamState'), minutes === 3 ? 'running' : 'finished');
        assert.equal(next.intervals.size, minutes === 3 ? 1 : 0);
        assert.equal(next.run('runBtn.disabled'), minutes === 6);
        assert.equal(next.run('trueExamSession.endsAt'), 10801000);
        if (minutes === 6) {
            assert.match(next.run('trueExamExpiredEl.textContent'), /cinq minutes/);
            assert.equal(snapshot(next).finishReason, 'interruption_timeout');
            await next.fire('pagehide');
            const again = await recover(next, {now: 400000, tabData: next.tabData, navigation: 'reload', page: 'again'});
            assert.equal(again.run('trueExamState'), 'finished');
            assert.equal(again.intervals.size, 0);
        }
    }
});

test('recognized reload has no extra five-minute limit; hidden tabs stay active for twenty minutes', async () => {
    const first = savedExam();
    first.advance(20 * 60000);
    await first.fire('visibilitychange');
    assert.equal(first.run('trueExamState'), 'running');
    assert.equal(snapshot(first).interruptedAt, null);
    assert.equal(first.run('trueExamTimerEl.textContent'), '02:40:00');
    await first.fire('pagehide');
    const next = await recover(first, {now: 1000 + 30 * 60000, tabData: first.tabData, navigation: 'reload'});
    assert.equal(next.run('trueExamState'), 'running');
    assert.equal(next.run('trueExamTimerEl.textContent'), '02:30:00');
});

test('original deadline beats recovery window and remains terminal after reload', async () => {
    const first = savedExam();
    await first.fire('pagehide');
    const next = await recover(first, {now: 10801000, tabData: first.tabData, navigation: 'reload'});
    assert.equal(next.run('trueExamState'), 'finished');
    assert.equal(next.run('trueExamTimerEl.textContent'), '00:00:00');
    assert.equal(next.run('runBtn.disabled'), true);
    assert.equal(snapshot(next).finishReason, 'time_expired');
    assert.equal(next.intervals.size, 0);
});

test('cancelling exit leaves storage unchanged; confirmed abandonment is never restored', async () => {
    const first = savedExam();
    const before = first.data.get(sessionKey);
    first.context.window.confirm = () => false;
    first.run('setAppMode("exam")');
    assert.equal(first.data.get(sessionKey), before);
    first.context.window.confirm = () => true;
    first.run('setAppMode("learning")');
    assert.equal(snapshot(first).finishReason, 'abandoned');
    assert.equal(first.intervals.size, 0);
    const next = setup({data: first.data});
    next.run('trueExamMode = false; initializeTrueExamRecovery()');
    assert.equal(next.run('trueExamMode'), false);
    assert.equal(next.run('trueExamRecoveryPending'), false);
    await next.run('restoreTrueExamSession()');
    assert.equal(next.intervals.size, 0);
    assert.match(next.run('trueExamExpiredEl.textContent'), /abandonné/);
});

test('corrupt snapshots, invalid metadata and missing IDs fail without random replacement', async () => {
    const variants = [
        () => '{invalid',
        () => 'null',
        () => 'false',
        () => '0',
        x => JSON.stringify({...x, version: 500}),
        x => JSON.stringify({...x, exerciseIds: ['missing'], exerciseId: 'missing', index: 0, drafts: {missing: ''}, code: ''}),
        x => JSON.stringify({...x, index: -1}),
        x => JSON.stringify({...x, index: 100}),
        x => JSON.stringify({...x, endsAt: 'invalid'}),
        x => JSON.stringify({...x, endsAt: x.endsAt + 1000}),
        x => JSON.stringify({...x, exerciseId: 'other'}),
        x => JSON.stringify({...x, interruptedAt: -1}),
        x => JSON.stringify({...x, drafts: {'ex-3': 123}}),
    ];
    for (const change of variants) {
        const first = savedExam();
        const raw = change(snapshot(first));
        first.data.set(sessionKey, raw);
        const next = await recover(first, {tabData: first.tabData, navigation: 'reload'});
        assert.equal(next.run('trueExamState'), 'finished');
        assert.equal(next.run('trueExamSession'), null);
        assert.equal(next.run('runBtn.disabled'), true);
        assert.equal(next.intervals.size, 0);
        assert.equal(next.run('trueExamSeries.length'), 0);
        assert.equal(first.data.get(sessionKey), raw);
        assert.match(next.run('trueExamExpiredEl.textContent'), /invalide|impossible/);
    }
});

test('duplicate restoration and a stale evaluation cannot overwrite recovered code', async () => {
    const s = savedExam();
    let resolve;
    s.context.fetch = () => new Promise(r => { resolve = r; });
    const pending = s.run('runCode()');
    s.run('trueExamRecoveryPending = true');
    await Promise.all([s.run('restoreTrueExamSession()'), s.run('restoreTrueExamSession()')]);
    assert.equal(s.intervals.size, 1);
    s.run('outputEl.textContent = "recovered"');
    resolve({ok: true, text: async () => '{"success":true,"output":"old"}'});
    await pending;
    assert.equal(s.run('outputEl.textContent'), 'recovered');
    const session = s.run('trueExamSession');
    await s.run('restoreTrueExamSession()');
    assert.equal(s.run('trueExamSession'), session);
    assert.equal(s.intervals.size, 1);
});

test('debounced input and pagehide flush exact edits; bfcache restoration keeps one clock', async () => {
    const s = savedExam();
    s.run('codeEditorEl.value = "latest"');
    for (let i = 0; i < 10; i++) await s.fire('input');
    assert.equal(s.timeouts.size, 1);
    assert.notEqual(snapshot(s).code, 'latest');
    await s.fire('pagehide', {persisted: true});
    assert.equal(s.timeouts.size, 0);
    assert.equal(snapshot(s).code, 'latest');
    assert.equal(s.intervals.size, 0);
    s.advance(180000);
    await s.fire('pageshow', {persisted: true});
    await s.run('trueExamRestorePromise');
    assert.equal(s.run('codeEditorEl.value'), 'latest');
    assert.equal(s.run('trueExamTimerEl.textContent'), '02:57:00');
    assert.equal(s.intervals.size, 1);
});

test('storage failures never interrupt a running exam', async () => {
    const s = setup();
    s.context.window.localStorage.setItem = () => { throw new Error('quota'); };
    s.run('startTrueExamSeries(); codeEditorEl.value = "code"; scheduleTrueExamSave()');
    s.flush();
    assert.equal(s.run('trueExamState'), 'running');
    assert.equal(s.intervals.size, 1);
    assert.equal(s.run('canRunTrueExam()'), true);
    assert.match(s.run('outputEl.textContent'), /Sauvegarde locale indisponible/);
});

test('second tab cannot overwrite an active exam in the conservative storage fallback', async () => {
    const first = savedExam();
    const before = first.data.get(sessionKey);
    const second = await recover(first, {now: 1000});
    assert.equal(second.run('trueExamSession'), null);
    assert.equal(second.intervals.size, 0);
    assert.equal(first.data.get(sessionKey), before);
    assert.match(second.run('trueExamExpiredEl.textContent'), /autre onglet/);
    assert.equal(first.run('canRunTrueExam()'), true);
});

test('Web Locks exclude concurrent tabs, then allow recovery after pagehide', async () => {
    let held = false;
    const navigator = {locks: {request: async (name, options, callback) => {
        assert.equal(options.ifAvailable, true);
        if (held) return callback(null);
        held = true;
        try { return await callback({name}); } finally { held = false; }
    }}};
    const first = setup({navigator});
    first.run('trueExamStorageOwned = false; available = Array.from({length: 10}, (_, i) => ({id: "ex-" + i}))');
    await Promise.all([first.run('requestTrueExamStart()'), first.run('requestTrueExamStart()')]);
    assert.equal(first.intervals.size, 1);
    const before = first.data.get(sessionKey);
    const second = await recover(first, {navigator});
    assert.equal(second.run('trueExamSession'), null);
    assert.equal(first.data.get(sessionKey), before);
    await first.fire('pagehide');
    const third = await recover(first, {navigator, page: 'third', now: 181000});
    assert.equal(third.run('trueExamState'), 'running');
    assert.equal(third.intervals.size, 1);
    await third.fire('pagehide');
});

test('catalog loading restores before normal initialization can clear recovered editor or series', async () => {
    const first = savedExam('js');
    await first.fire('pagehide');
    const original = snapshot(first);
    const next = setup({data: first.data, tabData: first.tabData, page: 'next', now: 61000, navigation: 'reload'});
    next.run('trueExamMode = false; trueExamStorageOwned = false; exercisesLoaded = false; initializeTrueExamRecovery()');
    assert.equal(next.run('trueExamRecoveryPending'), true);
    assert.equal(next.run('codeEditorEl.disabled'), true);
    const waiting = [];
    next.context.fetch = () => new Promise(resolve => waiting.push(resolve));
    const loading = next.run('loadExercises()');
    await next.run('requestTrueExamStart()');
    assert.equal(next.intervals.size, 0);
    // The catalogue used by the test renderer has the same stable IDs, in a different order.
    next.run('available = Array.from({length: 10}, (_, i) => ({id: "ex-" + (9 - i)}))');
    waiting.forEach(resolve => resolve({ok: true, json: async () => [{id: 'ex-3'}]}));
    await loading;
    assert.equal(next.run('trueExamRecoveryPending'), false);
    assert.equal(next.run('trueExamState'), 'running');
    assert.equal(next.run('currentTrack'), 'js');
    assert.equal(next.run('codeEditorEl.value'), original.code);
    assert.equal(next.run('trueExamIndex'), 3);
    assert.deepEqual(snapshot(next).exerciseIds, original.exerciseIds);
    assert.equal(next.run('trueExamTimerEl.textContent'), '02:59:00');
    assert.equal(next.intervals.size, 1);
});

test('failed catalogue loading preserves the original snapshot for retry', async () => {
    const first = savedExam();
    await first.fire('pagehide');
    const before = first.data.get(sessionKey);
    const next = setup({data: first.data, tabData: first.tabData});
    next.run('trueExamMode = false; initializeTrueExamRecovery()');
    next.context.fetch = async () => ({ok: false, status: 503});
    await next.run('loadExercises()');
    assert.equal(next.run('trueExamState'), 'finished');
    assert.equal(next.run('trueExamRecoveryPending'), false);
    assert.equal(first.data.get(sessionKey), before);
    assert.equal(next.intervals.size, 0);
    assert.match(next.run('trueExamExpiredEl.textContent'), /catalogue/);
});

test('fallback detects a competing writer before submissions and never overwrites its snapshot', async () => {
    const first = savedExam();
    const changed = {...snapshot(first), ownerId: 'other-page'};
    first.data.set(sessionKey, JSON.stringify(changed));
    let requests = 0;
    first.context.fetch = () => { requests++; };
    await first.run('runCode()');
    assert.equal(requests, 0);
    assert.equal(first.run('trueExamSession'), null);
    assert.equal(first.intervals.size, 0);
    assert.equal(snapshot(first).ownerId, 'other-page');
});

test('custom editor keyboard edits are saved, and inaccessible storage still allows starting', async () => {
    const s = savedExam();
    s.run('codeEditorEl.value = "()"');
    await s.fire('keydown', {key: '(', defaultPrevented: true});
    s.flush();
    assert.equal(snapshot(s).code, '()');
    const next = setup();
    next.run('trueExamStorageOwned = false');
    next.context.window.localStorage.getItem = () => { throw new Error('denied'); };
    next.context.window.localStorage.setItem = () => { throw new Error('denied'); };
    next.context.window.localStorage.removeItem = () => { throw new Error('denied'); };
    next.run('initializeTrueExamRecovery()');
    assert.equal(next.run('trueExamRecoveryPending'), false);
    await next.run('requestTrueExamStart()');
    assert.equal(next.run('trueExamState'), 'running');
    assert.equal(next.intervals.size, 1);
});

test('invalid saved data cannot be overwritten through the explicit Start action', async () => {
    for (const raw of ['null', 'false', '{broken', '{"version":99}']) {
        const s = setup();
        s.data.set(sessionKey, raw);
        await s.run('requestTrueExamStart()');
        assert.equal(s.run('trueExamSession'), null);
        assert.equal(s.intervals.size, 0);
        assert.equal(s.data.get(sessionKey), raw);
        assert.match(s.run('trueExamExpiredEl.textContent'), /invalide/);
    }
});
test('a finished saved session requires an explicit Start to create another exam', async () => {
    const s = savedExam();
    s.advance(10800000);
    s.run('refreshTrueExamTimer()');
    const original = snapshot(s);
    s.run('prepareTrueExam()');
    assert.equal(s.data.get(sessionKey), undefined);
    assert.equal(JSON.parse(s.data.get('z01exam-true-exam-report')).id, original.id);
    assert.equal(s.intervals.size, 0);
    await s.run('requestTrueExamStart()');
    assert.notEqual(s.run('trueExamSession.id'), original.id);
    assert.equal(s.run('trueExamState'), 'running');
    assert.equal(s.intervals.size, 1);
});


function navigationApi(index = 4) {
    const handlers = new Map();
    return {
        currentEntry: {index},
        addEventListener(name, fn) {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name).push(fn);
        },
        async fire(name, event) { for (const fn of handlers.get(name) || []) await fn(event); }
    };
}

test('confirmed exit clears session drafts, editor and persisted code before Forward', async () => {
    const s = savedExam();
    const oldId = snapshot(s).id;
    s.run('setAppMode("exam")');
    assert.deepEqual(snapshot(s), {version: 2, id: oldId, status: 'finished', finishReason: 'abandoned'});
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('trueExamSeries.length'), 0);
    assert.equal(s.run('trueExamIndex'), -1);
    assert.equal(s.run('currentExercise'), null);
    assert.equal(s.run('codeEditorEl.value'), '');
    await s.fire('pageshow', {persisted: true});
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('codeEditorEl.value'), '');
    assert.equal(s.intervals.size, 0);
    s.run('setAppMode("true-exam")');
    await s.run('requestTrueExamStart()');
    assert.notEqual(s.run('trueExamSession.id'), oldId);
    assert.equal(s.run('codeEditorEl.value'), '');
    assert.deepEqual(Object.values(snapshot(s).drafts), ['']);
});

test('cached history document cannot restore an exam abandoned while it was suspended', async () => {
    const cached = savedExam();
    await cached.fire('pagehide', {persisted: true});
    assert.equal(cached.run('codeEditorEl.value'), '');
    assert.equal(cached.run('trueExamSession'), null);
    const current = await recover(cached, {tabData: cached.tabData});
    current.run('setAppMode("exam")');
    const tombstone = current.data.get(sessionKey);
    await cached.fire('pageshow', {persisted: true});
    assert.equal(cached.run('trueExamSession'), null);
    assert.equal(cached.run('codeEditorEl.value'), '');
    assert.equal(cached.run('runBtn.disabled'), true);
    assert.equal(cached.intervals.size, 0);
    assert.equal(cached.data.get(sessionKey), tombstone);
    assert.match(cached.run('trueExamExpiredEl.textContent'), /abandonné/);
});

test('old cached document never attaches to or overwrites a replacement session', async () => {
    const cached = savedExam();
    const oldId = snapshot(cached).id;
    await cached.fire('pagehide', {persisted: true});
    const current = await recover(cached, {tabData: cached.tabData});
    current.run('setAppMode("exam"); setAppMode("true-exam")');
    await current.run('requestTrueExamStart()');
    assert.notEqual(current.run('trueExamSession.id'), oldId);
    const replacement = current.data.get(sessionKey);
    await cached.fire('pageshow', {persisted: true});
    assert.equal(cached.run('trueExamSession'), null);
    assert.equal(cached.run('codeEditorEl.value'), '');
    assert.equal(cached.intervals.size, 0);
    assert.equal(current.data.get(sessionKey), replacement);
    assert.equal(current.run('canRunTrueExam()'), true);
});

test('reliably identified cross-document Back abandons; Forward cannot recover the old code', async () => {
    const nav = navigationApi();
    const s = setup({navigationApi: nav});
    s.run('startTrueExamSeries(); codeEditorEl.value = "old code"; saveTrueExamSession()');
    const oldId = snapshot(s).id;
    await nav.fire('navigate', {navigationType: 'traverse', destination: {index: 3}, signal: {aborted: false}});
    // Merely announcing a navigation does not destroy the exam.
    assert.equal(s.run('trueExamState'), 'running');
    await s.fire('pagehide', {persisted: true});
    assert.equal(snapshot(s).finishReason, 'abandoned');
    assert.equal(snapshot(s).id, oldId);
    assert.equal(snapshot(s).code, undefined);
    assert.equal(snapshot(s).drafts, undefined);
    await s.fire('pageshow', {persisted: true});
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('codeEditorEl.value'), '');
    const forward = setup({data: s.data});
    forward.run('trueExamMode = false; initializeTrueExamRecovery()');
    assert.equal(forward.run('trueExamRecoveryPending'), false);
    assert.equal(forward.run('trueExamSession'), null);
});

test('same-document Back requires a committed matching traversal, never a bare popstate', async () => {
    const nav = navigationApi();
    const s = setup({navigationApi: nav});
    s.run('startTrueExamSeries(); codeEditorEl.value = "code"; saveTrueExamSession()');
    const original = snapshot(s).id;
    await s.fire('popstate', {state: null});
    await nav.fire('currententrychange', {navigationType: 'traverse', from: {index: 5}});
    assert.equal(s.run('trueExamSession.id'), original);
    await nav.fire('navigate', {navigationType: 'traverse', destination: {index: 3}, signal: {aborted: false}});
    nav.currentEntry.index = 3;
    await nav.fire('currententrychange', {navigationType: 'traverse', from: {index: 4}});
    assert.equal(snapshot(s).finishReason, 'abandoned');
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('codeEditorEl.value'), '');
    nav.currentEntry.index = 4;
    await nav.fire('currententrychange', {navigationType: 'traverse', from: {index: 3}});
    assert.equal(s.run('trueExamSession'), null);
});

test('aborted/failed Back, reload, Forward and unknown destinations are never inferred as abandonment', async () => {
    const cases = [
        {type: 'traverse', destination: 3, aborted: true},
        {type: 'traverse', destination: 3, failed: true},
        {type: 'reload', destination: 3},
        {type: 'traverse', destination: 5},
        {type: 'traverse', destination: -1},
        {type: 'push', destination: 3},
    ];
    for (const entry of cases) {
        const nav = navigationApi();
        const s = setup({navigationApi: nav});
        s.run('startTrueExamSeries(); codeEditorEl.value = "retained"; saveTrueExamSession()');
        await nav.fire('navigate', {navigationType: entry.type, destination: {index: entry.destination}, signal: {aborted: !!entry.aborted}});
        if (entry.failed) await nav.fire('navigateerror', {});
        await s.fire('pagehide');
        assert.equal(snapshot(s).status, 'running');
        assert.equal(snapshot(s).code, 'retained');
        assert.equal(snapshot(s).interruptedAt, 1000);
    }
});

test('ambiguous history events stay recoverable without the Navigation API', async () => {
    const s = savedExam();
    await s.fire('popstate', {state: null});
    await s.fire('pagehide');
    assert.equal(snapshot(s).status, 'running');
    assert.equal(snapshot(s).interruptedAt, 1000);
    await s.fire('pageshow', {persisted: true});
    assert.equal(s.run('trueExamState'), 'running');
    assert.notEqual(s.run('codeEditorEl.value'), '');
    assert.equal(s.intervals.size, 1);
    assert.ok(!source.includes('history.go('));
    assert.ok(fs.readFileSync('index.html', 'utf8').includes('id="code-editor" spellcheck="false" autocomplete="off"'));
});

test('leaving preparation without an exam preserves unrelated regular editor text', () => {
    const s = setup();
    s.run('prepareTrueExam(); codeEditorEl.value = "regular draft"; setAppMode("exam")');
    assert.equal(s.run('codeEditorEl.value'), 'regular draft');
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.intervals.size, 0);
});

test('controlled history survives F5 without adding another entry or resetting session/code/deadline', async () => {
    const s = savedExam();
    const original = snapshot(s);
    const length = s.history.length;
    s.advance(1800000);
    await s.fire('pagehide');
    const next = await recover(s, {history: s.history, tabData: s.tabData, navigation: 'reload', now: 1801000});
    assert.equal(next.history.length, length);
    assert.equal(next.run('trueExamSession.id'), original.id);
    assert.equal(next.run('codeEditorEl.value'), original.code);
    assert.equal(next.run('trueExamTimerEl.textContent'), '02:30:00');
    assert.equal(next.history.backCalls, 0);
});

test('one Back abandons and skips the controlled entry once; Forward never restores old exam', async () => {
    const s = savedExam(); // No Navigation API: the Firefox fallback path.
    const original = snapshot(s);
    assert.equal(s.history.length, 3); // Previous page, original app entry, controlled entry.
    const base = s.history.move(-1); // One user Back.
    await s.fire('popstate', {state: base});
    assert.equal(s.history.backCalls, 1);
    assert.equal(snapshot(s).id, original.id);
    assert.equal(snapshot(s).finishReason, 'abandoned');
    assert.equal(snapshot(s).code, undefined);
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('codeEditorEl.value'), '');
    assert.equal(s.intervals.size, 0);
    s.history.move(-1); // The single automatic continuation leaves the app.
    await s.fire('pagehide', {persisted: true});
    assert.equal(s.history.index, 0);
    s.history.move(1); // User Forward reaches the app's base entry.
    await s.fire('pageshow', {persisted: true});
    await s.fire('popstate', {state: s.history.state});
    assert.equal(s.history.backCalls, 1); // No bouncing back or history loop.
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('codeEditorEl.value'), '');
    s.history.move(1); // A second Forward can reach the former controlled entry.
    await s.fire('popstate', {state: s.history.state});
    assert.equal(s.history.backCalls, 1);
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('codeEditorEl.value'), '');
    assert.equal(s.history.length, 3);
});

test('Back then a fresh navigation to the application cannot recover the old UUID', async () => {
    const s = savedExam();
    const original = snapshot(s);
    await s.fire('popstate', {state: s.history.move(-1)});
    const reopened = setup({data: s.data, tabData: s.tabData, page: 'fresh-navigation'});
    reopened.run('trueExamMode = false; codeEditorEl.value = ""; initializeTrueExamRecovery()');
    assert.equal(reopened.run('trueExamRecoveryPending'), false);
    assert.equal(reopened.run('trueExamSession'), null);
    assert.equal(reopened.run('codeEditorEl.value'), '');
    reopened.run('setAppMode("true-exam")');
    await reopened.run('requestTrueExamStart()');
    assert.notEqual(reopened.run('trueExamSession.id'), original.id);
    assert.equal(reopened.run('codeEditorEl.value'), '');
});

test('fresh exams reuse the controlled entry, and Back abandons the newest UUID', async () => {
    const s = savedExam();
    const ids = new Set([snapshot(s).id]);
    for (let i = 0; i < 6; i++) {
        s.run('setAppMode("exam"); setAppMode("true-exam")');
        await s.run('requestTrueExamStart()');
        assert.equal(s.history.length, 3);
        assert.equal(s.history.backCalls, 0);
        const id = s.run('trueExamSession.id');
        assert.equal(ids.has(id), false);
        ids.add(id);
        assert.equal(s.run('codeEditorEl.value'), '');
    }
    const lastId = snapshot(s).id;
    await s.fire('popstate', {state: s.history.move(-1)});
    assert.equal(snapshot(s).id, lastId);
    assert.equal(snapshot(s).finishReason, 'abandoned');
    assert.equal(s.history.backCalls, 1);
});

test('background and closure do not traverse the guard and preserve five-minute recovery', async () => {
    const s = savedExam();
    const original = snapshot(s);
    s.advance(1200000);
    await s.fire('visibilitychange');
    assert.equal(s.run('trueExamState'), 'running');
    assert.equal(s.history.backCalls, 0);
    assert.equal(snapshot(s).interruptedAt, null);
    await s.fire('pagehide');
    assert.equal(snapshot(s).status, 'running');
    const next = await recover(s, {history: s.history, now: 1381000});
    assert.equal(next.run('trueExamSession.id'), original.id);
    assert.equal(next.run('codeEditorEl.value'), original.code);
    assert.equal(next.history.length, 3);
    assert.equal(next.history.backCalls, 0);
});

test('Back immediately after F5 invalidates the saved session before catalogue restoration', async () => {
    const s = savedExam();
    await s.fire('pagehide');
    const next = setup({data: s.data, tabData: s.tabData, history: s.history, page: 'reload', navigation: 'reload'});
    next.run('trueExamStorageOwned = false; trueExamMode = false; exercisesLoaded = false; initializeTrueExamRecovery()');
    assert.equal(next.run('trueExamRecoveryPending'), true);
    await next.fire('popstate', {state: next.history.move(-1)});
    assert.equal(snapshot(next).finishReason, 'abandoned');
    assert.equal(next.history.backCalls, 1);
    await next.run('restoreTrueExamSession()');
    assert.equal(next.run('trueExamSession'), null);
    assert.equal(next.run('codeEditorEl.value'), '');
    assert.equal(next.intervals.size, 0);
});

test('unsupported history handling reports its limitation instead of pretending Back is protected', () => {
    const s = setup();
    s.context.window.history.pushState = () => {throw new Error('blocked');};
    s.run('startTrueExamSeries()');
    assert.equal(s.run('trueExamState'), 'running');
    assert.equal(s.run('trueExamHistoryGuard'), null);
    assert.match(s.run('outputEl.textContent'), /ne peut pas être garanti/);
    assert.equal(s.history.backCalls, 0);
});

const reportKey = 'z01exam-true-exam-report';
function finalReport(s) { return JSON.parse(s.data.get(reportKey)); }
function reportExam() {
    const s = setup();
    s.run('available = [{id:"a", title:"Alpha",level:1}, {id:"b", title:"Beta",level:2}, {id:"c",title:"<img src=x onerror=alert(1)>",level:3}]; startTrueExamSeries()');
    return s;
}
async function evaluate(s, success, index = null) {
    if (index !== null) s.run(`trueExamIndex = ${index}; selectExercise(exId(trueExamSeries[trueExamIndex]))`);
    s.context.fetch = async () => ({ok: true, text: async () => JSON.stringify({success, output: 'evaluation'})});
    await s.run('runCode()');
}

test('early submission preserves actual evaluations and renders mutually exclusive full-screen results', async () => {
    const s = reportExam();
    await evaluate(s, true);
    assert.equal(s.run('trueExamIndex'), 1); // Success advanced exactly one exercise.
    await evaluate(s, false, 1);
    s.advance(125000);
    s.run('submitTrueExamEarly()');
    const report = finalReport(s);
    assert.equal(report.reason, 'submitted_early');
    assert.equal(report.completedAt, 126000);
    assert.deepEqual(report.summary, {successful: 1, unsuccessful: 1, unattempted: 1, submissions: 2, usedMs: 125000, durationMs: 10800000});
    assert.equal(report.summary.successful + report.summary.unsuccessful + report.summary.unattempted, report.exerciseIds.length);
    assert.equal(s.run('trueExamResultsEl.hidden'), false);
    assert.equal(s.run('trueExamFinishBtn.hidden'), true);
    assert.equal(s.run('codeEditorEl.disabled'), true);
    assert.equal(s.run('trueExamHeaderEl.hidden'), true);
    assert.equal(s.run('trueExamResultSummaryEl.textContent'), '1 / 3 exercices réussis');
    assert.equal(s.run('trueExamResultRowsEl.children[2].children[0].textContent'), '<img src=x onerror=alert(1)>');
    assert.equal(s.intervals.size, 0);
    assert.equal(snapshot(s).status, 'finished');
    assert.equal(snapshot(s).code, undefined);
});

test('cancelled early submission preserves countdown, statistics, UUID and stored data', async () => {
    const s = reportExam();
    await evaluate(s, false);
    const original = s.data.get(sessionKey);
    const session = s.run('trueExamSession');
    s.context.window.confirm = message => {
        assert.match(message, /bilan/);
        assert.match(message, /ne pourra plus être repris/);
        return false;
    };
    s.run('submitTrueExamEarly()');
    assert.equal(s.run('trueExamSession'), session);
    assert.equal(s.run('trueExamState'), 'running');
    assert.equal(s.data.get(sessionKey), original);
    assert.equal(s.data.get(reportKey), undefined);
    assert.equal(s.intervals.size, 1);
});

test('only well-formed HTTP evaluations count; repeated failures and successes keep accurate attempts', async () => {
    const s = reportExam();
    for (const response of [
        {ok: false, text: async () => '{"success":false}'},
        {ok: true, text: async () => 'not JSON'},
        {ok: true, text: async () => '{"success":"yes"}'},
        {ok: true, text: async () => 'null'}
    ]) {
        s.context.fetch = async () => response;
        await s.run('runCode()');
    }
    assert.equal(s.run('trueExamSession.results.a.attempts'), 0);
    s.context.fetch = async () => { throw new Error('offline'); };
    await s.run('runCode()');
    assert.equal(s.run('trueExamSession.results.a.attempts'), 0);
    await evaluate(s, false);
    await evaluate(s, false);
    await evaluate(s, true);
    assert.equal(s.run('trueExamSession.results.a.attempts'), 3);
    assert.equal(s.run('trueExamSession.results.a.success'), true);
    s.run('submitTrueExamEarly()');
    assert.equal(finalReport(s).summary.successful, 1);
    assert.equal(finalReport(s).summary.unsuccessful, 0);
    assert.equal(finalReport(s).summary.unattempted, 2);
    assert.equal(finalReport(s).summary.submissions, 3);
});

test('expiration fixes the report at the original deadline and ignores pending evaluations', async () => {
    const s = reportExam();
    await evaluate(s, true);
    let resolve;
    s.context.fetch = () => new Promise(r => {resolve = r;});
    const pending = s.run('runCode()');
    s.advance(10800000 + 60000); // A throttled tab wakes after the deadline.
    s.run('refreshTrueExamTimer()');
    const serialized = s.data.get(reportKey);
    const report = finalReport(s);
    assert.equal(report.reason, 'time_expired');
    assert.equal(report.completedAt, report.endsAt);
    assert.equal(report.summary.usedMs, 10800000);
    assert.equal(report.summary.submissions, 1);
    resolve({ok: true, text: async () => '{"success":true}'});
    await pending;
    assert.equal(s.data.get(reportKey), serialized);
    assert.equal(s.run('trueExamResultsEl.hidden'), false);
    s.run('finishTrueExamSession("submitted_early"); expireTrueExamSession()');
    assert.equal(s.data.get(reportKey), serialized);
});

test('success advances through the series and the last exercise finishes automatically', async () => {
    const s = setup();
    s.run('available = [{id:"a"},{id:"b"}]; startTrueExamSeries()');
    await evaluate(s, true);
    assert.equal(s.run('currentExercise.id'), 'b');
    assert.equal(s.run('trueExamState'), 'running');
    await evaluate(s, true);
    assert.equal(s.run('trueExamState'), 'finished');
    assert.equal(finalReport(s).reason, 'completed');
    assert.equal(finalReport(s).summary.successful, 2);
    assert.equal(finalReport(s).summary.submissions, 2);
    assert.equal(s.run('trueExamResultsEl.hidden'), false);
});

test('F5 restores the final report without catalogues, a timer or editable workspace', async () => {
    const first = reportExam();
    await evaluate(first, false);
    first.run('submitTrueExamEarly()');
    const original = finalReport(first);
    const next = setup({data: first.data, tabData: first.tabData, page: 'report-reload'});
    next.run('trueExamMode = false; exercisesLoaded = false; initializeTrueExamRecovery()');
    await next.run('trueExamRestorePromise');
    assert.equal(next.run('trueExamResultsEl.hidden'), false);
    assert.equal(next.run('trueExamSession.id'), original.id);
    assert.equal(next.run('trueExamSession.finishReason'), 'submitted_early');
    assert.equal(next.run('trueExamReport.completedAt'), original.completedAt);
    assert.equal(next.run('codeEditorEl.disabled'), true);
    assert.equal(next.intervals.size, 0);
    assert.deepEqual(finalReport(next), original);
});

test('recovery timeout keeps saved evaluations and reports the interruption cutoff', async () => {
    const first = savedExam();
    await evaluate(first, false);
    const id = snapshot(first).id;
    await first.fire('pagehide');
    const next = await recover(first, {now: 361000});
    assert.equal(next.run('trueExamResultsEl.hidden'), false);
    assert.equal(finalReport(next).id, id);
    assert.equal(finalReport(next).reason, 'interruption_timeout');
    assert.equal(finalReport(next).summary.unsuccessful, 1);
    assert.equal(finalReport(next).summary.submissions, 1);
    assert.equal(finalReport(next).completedAt, 301000);
});

test('results New Exam returns to preparation and Quit never reclassifies the report as abandonment', async () => {
    const s = reportExam();
    await evaluate(s, true);
    s.run('submitTrueExamEarly()');
    const original = finalReport(s);
    s.run('newTrueExamFromReport()');
    assert.equal(s.run('trueExamState'), 'ready');
    assert.equal(s.run('trueExamSession'), null);
    assert.equal(s.run('trueExamSeries.length'), 0);
    assert.equal(s.run('codeEditorEl.value'), '');
    assert.equal(s.run('trueExamResultsEl.hidden'), true);
    assert.equal(s.run('trackSwitchEl.hidden'), false);
    assert.equal(s.intervals.size, 0);
    await s.run('requestTrueExamStart()');
    assert.notEqual(s.run('trueExamSession.id'), original.id);
    assert.equal(s.run('trueExamSession.results.a.attempts'), 0);
    assert.equal(s.run('codeEditorEl.value'), '');
    s.run('submitTrueExamEarly()');
    const final = s.data.get(reportKey);
    s.context.window.confirm = () => { throw new Error('Finished sessions need no confirmation'); };
    s.run('setAppMode("exam")');
    assert.equal(s.run('trueExamMode'), false);
    assert.equal(s.data.get(reportKey), final);
    assert.equal(JSON.parse(final).reason, 'submitted_early');
    assert.equal(s.data.get(sessionKey), undefined);
});

test('Browser Back and a cached Forward cannot turn completion into abandonment or an editable exam', async () => {
    const s = reportExam();
    s.run('submitTrueExamEarly()');
    const original = s.data.get(reportKey);
    await s.fire('popstate', {state: s.history.move(-1)});
    assert.equal(snapshot(s).finishReason, 'submitted_early');
    assert.equal(s.data.get(reportKey), original);
    s.history.move(-1);
    await s.fire('pagehide', {persisted: true});
    s.history.move(1);
    await s.fire('pageshow', {persisted: true});
    assert.equal(s.run('trueExamResultsEl.hidden'), false);
    assert.equal(s.run('codeEditorEl.disabled'), true);
    assert.equal(s.intervals.size, 0);
});

test('v1 active and expired snapshots migrate without pretending unrecorded attempts succeeded', async () => {
    for (const terminal of [false, true]) {
        const first = savedExam();
        await first.fire('pagehide');
        const legacy = snapshot(first);
        legacy.version = 1;
        delete legacy.results;
        if (terminal) {legacy.status = 'finished'; legacy.finishReason = 'expired';}
        first.data.set(sessionKey, JSON.stringify(legacy));
        const next = await recover(first, {now: terminal ? 10801000 : 61000, tabData: first.tabData, navigation: 'reload'});
        if (terminal) {
            assert.equal(finalReport(next).reason, 'time_expired');
            assert.equal(finalReport(next).summary.successful, 0);
            assert.equal(finalReport(next).summary.unattempted, 10);
        } else {
            assert.equal(next.run('trueExamState'), 'running');
            assert.equal(snapshot(next).version, 2);
            assert.equal(next.run('trueExamSession.results["ex-3"].attempts'), 0);
            assert.equal(next.run('currentExercise.id'), 'ex-3');
        }
    }
});

test('responses for a changed exercise are rejected, and valid progressed results survive reload', async () => {
    const s = reportExam();
    let resolve;
    s.context.fetch = () => new Promise(r => {resolve = r;});
    const pending = s.run('runCode()');
    s.run('trueExamIndex = 1; selectExercise("b")');
    resolve({ok: true, text: async () => '{"success":true}'});
    await pending;
    assert.equal(s.run('trueExamSession.results.a.success'), false);
    assert.equal(s.run('trueExamSession.results.a.attempts'), 0);
    assert.equal(s.run('trueExamSession.results.b.attempts'), 0);
    await evaluate(s, true);
    await s.fire('pagehide');
    const next = setup({data: s.data, tabData: s.tabData, page: 'recovered-stats', now: 61000, navigation: 'reload'});
    next.run('trueExamStorageOwned = false; trueExamRecoveryPending = true; available = [{id:"a",title:"Alpha",level:1},{id:"b",title:"Beta",level:2},{id:"c"}]');
    await next.run('restoreTrueExamSession()');
    assert.equal(next.run('trueExamState'), 'running');
    assert.equal(next.run('trueExamSession.results.b.attempts'), 1);
    assert.equal(next.run('trueExamSession.results.b.success'), true);
    assert.equal(next.run('trueExamIndex'), 2);
    next.run('submitTrueExamEarly()');
    assert.equal(finalReport(next).summary.successful, 1);
    assert.equal(finalReport(next).summary.unattempted, 2);
});

test('legacy completed interruption stays terminal even if restored after the original deadline', async () => {
    const s = savedExam();
    await s.fire('pagehide');
    const legacy = snapshot(s);
    legacy.version = 1;
    delete legacy.results;
    legacy.status = 'finished';
    legacy.finishReason = 'interruption';
    legacy.savedAt = 400000;
    s.data.set(sessionKey, JSON.stringify(legacy));
    const next = await recover(s, {now: 12000000, tabData: s.tabData});
    assert.equal(finalReport(next).reason, 'interruption_timeout');
    assert.equal(finalReport(next).completedAt, 400000);
    assert.equal(next.intervals.size, 0);
});

test('a corrupt or missing report cannot turn its terminal session pointer into a running exam', async () => {
    for (const corrupt of [null, {version: 99}, {summary: 'invalid'}]) {
        const s = reportExam();
        s.run('submitTrueExamEarly()');
        const id = finalReport(s).id;
        if (corrupt === null) s.data.delete(reportKey);
        else s.data.set(reportKey, JSON.stringify({...finalReport(s), ...corrupt, id}));
        const next = await recover(s);
        assert.equal(next.run('trueExamSession'), null);
        assert.equal(next.run('runBtn.disabled'), true);
        assert.equal(next.run('codeEditorEl.disabled'), true);
        assert.equal(next.intervals.size, 0);
    }
});

test('an early-submission confirmation accepted after the deadline yields time_expired', () => {
    const s = reportExam();
    s.context.window.confirm = () => {s.advance(10800000); return true;};
    s.run('submitTrueExamEarly()');
    assert.equal(finalReport(s).reason, 'time_expired');
    assert.equal(finalReport(s).completedAt, 10801000);
});

test('storage failure preserves the in-memory report and displays a results warning', () => {
    const s = reportExam();
    s.context.window.localStorage.setItem = () => {throw new Error('quota');};
    s.run('submitTrueExamEarly()');
    assert.equal(s.run('trueExamReport.reason'), 'submitted_early');
    assert.equal(s.run('trueExamResultsEl.hidden'), false);
    assert.match(s.run('trueExamResultStorageEl.textContent'), /pourrait être perdu/);
    assert.equal(s.intervals.size, 0);
});

test('the last exercise index never implies successful completion', () => {
    const s = reportExam();
    s.run('trueExamIndex = 2; selectExercise("c"); submitTrueExamEarly()');
    assert.equal(finalReport(s).summary.successful, 0);
    assert.equal(finalReport(s).summary.unsuccessful, 0);
    assert.equal(finalReport(s).summary.unattempted, 3);
    assert.equal(finalReport(s).summary.submissions, 0);
});

test('pending successful evaluations cannot modify an early-submission report', async () => {
    const s = reportExam();
    let resolve;
    s.context.fetch = () => new Promise(r => {resolve = r;});
    const pending = s.run('runCode()');
    s.run('submitTrueExamEarly()');
    const report = s.data.get(reportKey);
    resolve({ok: true, text: async () => '{"success":true,"output":"late"}'});
    await pending;
    assert.equal(s.data.get(reportKey), report);
    assert.equal(finalReport(s).summary.successful, 0);
    assert.equal(finalReport(s).summary.submissions, 0);
    assert.equal(s.run('trueExamResultsEl.hidden'), false);
});

test('failure keeps code/output; success preserves drafts and attempts while switching statements once', async () => {
    const s = reportExam();
    const original = s.run('trueExamSession');
    const interval = s.run('trueExamTimerInterval');
    s.run('codeEditorEl.value = "first solution"');
    await evaluate(s, false);
    assert.equal(s.run('currentExercise.id'), 'a');
    assert.equal(s.run('codeEditorEl.value'), 'first solution');
    assert.equal(s.run('outputEl.textContent'), 'evaluation');
    assert.equal(s.run('trueExamSession.results.a.attempts'), 1);
    s.run('trueExamSession.drafts.b = "own draft for b"');
    await evaluate(s, true);
    assert.equal(s.run('trueExamSession'), original);
    assert.equal(s.run('trueExamTimerInterval'), interval);
    assert.equal(s.run('trueExamSession.startedAt'), 1000);
    assert.equal(s.run('trueExamSession.endsAt'), 10801000);
    assert.equal(s.run('trueExamIndex'), 1);
    assert.equal(s.run('currentExercise.id'), 'b');
    assert.equal(s.run('trueExamProgressEl.textContent'), 'Exercice 02 / 03');
    assert.equal(s.run('codeEditorEl.value'), 'own draft for b');
    assert.equal(s.run('trueExamSession.drafts.a'), 'first solution');
    assert.equal(s.run('trueExamSession.results.a.attempts'), 2);
    assert.equal(s.run('trueExamSession.results.a.success'), true);
    assert.equal(s.run('outputEl.textContent'), '');
    assert.equal(snapshot(s).exerciseId, 'b');
    assert.equal(snapshot(s).index, 1);
    assert.equal(snapshot(s).code, 'own draft for b');
    assert.equal(snapshot(s).results.a.attempts, 2);
    assert.equal(s.run('runBtn.disabled'), false);
    assert.equal(s.run('trueExamNextBtn.hidden && trueExamRestartBtn.hidden'), true);
});

test('repeated Run actions while pending send one request and can only advance one exercise', async () => {
    const s = reportExam();
    let resolve;
    let count = 0;
    s.context.fetch = () => {count++; return new Promise(r => {resolve = r;});};
    const first = s.run('runCode()');
    assert.equal(s.run('runBtn.disabled'), true);
    const token = s.run('trueExamEvaluation');
    assert.equal(token.sessionId, s.run('trueExamSession.id'));
    assert.equal(token.exerciseId, 'a');
    assert.equal(token.exerciseIndex, 0);
    await s.run('runCode()');
    s.run('updateTrueExamControls()');
    assert.equal(s.run('runBtn.disabled'), true);
    assert.equal(count, 1);
    resolve({ok: true, text: async () => '{"success":true,"output":"a passed"}'});
    resolve({ok: true, text: async () => '{"success":true}'}); // A duplicate promise completion has no effect.
    await first;
    assert.equal(s.run('trueExamIndex'), 1);
    assert.equal(s.run('trueExamSession.results.a.attempts'), 1);
    assert.equal(s.run('trueExamSession.results.b.attempts'), 0);
    assert.equal(s.run('trueExamEvaluation'), null);
    assert.equal(s.run('runBtn.disabled'), false);
    assert.equal(s.run('outputEl.textContent'), '');
});

test('an old request cannot release the Run lock held by a replacement session', async () => {
    const s = reportExam();
    const resolvers = [];
    s.context.fetch = () => new Promise(resolve => resolvers.push(resolve));
    const old = s.run('runCode()');
    s.run('setAppMode("exam"); setAppMode("true-exam")');
    await s.run('requestTrueExamStart()');
    const currentId = s.run('trueExamSession.id');
    const current = s.run('runCode()');
    const token = s.run('trueExamEvaluation');
    resolvers[0]({ok: true, text: async () => '{"success":true}'});
    await old;
    assert.equal(s.run('trueExamSession.id'), currentId);
    assert.equal(s.run('trueExamIndex'), 0);
    assert.equal(s.run('trueExamEvaluation'), token);
    assert.equal(s.run('runBtn.disabled'), true);
    assert.equal(s.run('trueExamSession.results.a.attempts'), 0);
    resolvers[1]({ok: true, text: async () => '{"success":false,"output":"retry"}'});
    await current;
    assert.equal(s.run('trueExamSession.results.a.attempts'), 1);
    assert.equal(s.run('trueExamIndex'), 0);
    assert.equal(s.run('runBtn.disabled'), false);
});

test('invalid or failed HTTP evaluation releases Run without counting or advancing', async () => {
    const s = reportExam();
    for (const response of [
        {ok: false, text: async () => '{"success":true}'},
        {ok: true, text: async () => 'broken'},
        {ok: true, text: async () => '{"success":"true"}'}
    ]) {
        s.context.fetch = async () => response;
        await s.run('runCode()');
        assert.equal(s.run('trueExamIndex'), 0);
        assert.equal(s.run('trueExamSession.results.a.attempts'), 0);
        assert.equal(s.run('runBtn.disabled'), false);
    }
    s.context.fetch = async () => {throw new Error('offline');};
    await s.run('runCode()');
    assert.equal(s.run('trueExamEvaluation'), null);
    assert.equal(s.run('runBtn.disabled'), false);
});

test('a successful response after the deadline cannot count, progress or re-enable Run', async () => {
    const s = reportExam();
    let resolve;
    s.context.fetch = () => new Promise(r => {resolve = r;});
    const pending = s.run('runCode()');
    s.advance(10800000);
    resolve({ok: true, text: async () => '{"success":true}'});
    await pending;
    assert.equal(finalReport(s).reason, 'time_expired');
    assert.equal(finalReport(s).summary.successful, 0);
    assert.equal(finalReport(s).summary.submissions, 0);
    assert.equal(s.run('trueExamState'), 'finished');
    assert.equal(s.run('runBtn.disabled'), true);
    assert.equal(s.intervals.size, 0);
});

test('a legacy session on the final exercise completes without inventing prior successes', async () => {
    const s = savedExam();
    s.run('trueExamIndex = 9; selectExercise("ex-9")');
    await evaluate(s, true);
    assert.equal(finalReport(s).reason, 'completed');
    assert.equal(finalReport(s).summary.successful, 1);
    assert.equal(finalReport(s).summary.unattempted, 9);
    const next = await recover(s);
    assert.equal(next.run('trueExamReport.reason'), 'completed');
    assert.equal(next.run('trueExamReport.summary.successful'), 1);
    assert.equal(next.intervals.size, 0);
});

test('Exam and Learning keep their existing evaluation behavior and are not serialized by True Exam', async () => {
    for (const learning of [false, true]) {
        const s = setup();
        s.run(`trueExamMode = false; learningMode = ${learning}; runBtn.disabled = false`);
        const resolvers = [];
        s.context.fetch = () => new Promise(resolve => resolvers.push(resolve));
        const first = s.run('runCode()');
        const second = s.run('runCode()');
        assert.equal(resolvers.length, 2);
        assert.equal(s.run('runBtn.disabled'), false);
        assert.equal(s.run('trueExamEvaluation'), null);
        resolvers[1]({ok: true, text: async () => '{"success":true}'});
        await second;
        resolvers[0]({ok: true, text: async () => '{"success":false,"output":"regular output"}'});
        await first;
        assert.equal(s.run('currentExercise.id'), 'test');
        assert.equal(s.run('outputEl.textContent'), 'regular output');
        assert.equal(s.data.get(sessionKey), undefined);
    }
});

test('F5 after progression restores the next exercise, its code and accepted results with the original clock', async () => {
    const s = reportExam();
    s.run('codeEditorEl.value = "solution a"');
    await evaluate(s, true);
    s.run('codeEditorEl.value = "draft b"; saveTrueExamSession()');
    const original = snapshot(s);
    s.advance(60000);
    await s.fire('pagehide');
    const next = setup({data: s.data, tabData: s.tabData, history: s.history, page: 'after-progress', now: 61000, navigation: 'reload'});
    next.run('trueExamStorageOwned = false; trueExamRecoveryPending = true; available = [{id:"a",title:"Alpha",level:1},{id:"b",title:"Beta",level:2},{id:"c"}]');
    await next.run('restoreTrueExamSession()');
    assert.equal(next.run('trueExamSession.id'), original.id);
    assert.equal(next.run('trueExamSession.startedAt'), original.startedAt);
    assert.equal(next.run('trueExamSession.endsAt'), original.endsAt);
    assert.equal(next.run('trueExamTimerEl.textContent'), '02:59:00');
    assert.equal(next.run('currentExercise.id'), 'b');
    assert.equal(next.run('trueExamIndex'), 1);
    assert.equal(next.run('codeEditorEl.value'), 'draft b');
    assert.equal(next.run('trueExamSession.results.a.success'), true);
    assert.equal(next.run('trueExamSession.results.a.attempts'), 1);
    assert.equal(next.run('trueExamSession.drafts.a'), 'solution a');
    assert.equal(next.run('trueExamEvaluation'), null);
    assert.equal(next.run('runBtn.disabled'), false);
    assert.equal(next.intervals.size, 1);
});
