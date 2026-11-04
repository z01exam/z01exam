const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');
function setup() {
    let now = 1000;
    const intervals = new Map();
    let id = 0;
    const context = vm.createContext({
        window: { confirm: () => true, localStorage: { setItem() {} } },
        Date: { now: () => now },
        setInterval: fn => { intervals.set(++id, fn); return id; },
        clearInterval: id => intervals.delete(id),
        document: { addEventListener() {} },
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
        const outputEl = {textContent: ''}, codeEditorEl = {value: 'code'};
        const examTitleEl = {}, statementEl = {};
        let available = [{id: 'test'}];
        function isJsTrack() {return currentTrack === 'js';}
        function isRustTrack() {return currentTrack === 'rust';}
        function isJavaTrack() {return currentTrack === 'java';}
        let jsExercises = [{id: 'js'}], exercises = [], rustExercises = [], javaExercises = [];
        function getExerciseLevel() {return 1;}
        function getTrackExercises() {return available;}
        function buildTrueExamSeries() {return available;}
        function renderChips() {}
        function setActiveExerciseChip() {}
        function updateExerciseHeader() {}
        function markdownToHtml() {return '';}
        function exStatement() {return '';}
        function highlightMarkdownCode() {}
        function updateTrueExamStatus() {}
        function exId(ex) {return ex.id;}
    `, context);
    const add = (from, to) => vm.runInContext(source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))), context);
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
    return { run: code => vm.runInContext(code, context), advance: ms => { now += ms; }, intervals, context };
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
    resolve({ text: async () => '{"success":true,"output":"late"}' });
    await pending;
    assert.equal(s.run('trueExamSession.expired'), true);
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
    s.run('setAppMode("exam"); setAppMode("true-exam"); startTrueExamSeries(); outputEl.textContent = "new session"');
    resolve({ text: async () => '{"success":false,"output":"old session"}' });
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
test('manual progression stays blocked and success leaves the current exercise active', async () => {
    const s = setup();
    s.run('available = [{id: "test"}, {id: "second"}]; startTrueExamSeries()');
    s.run('nextTrueExamExercise(); restartTrueExamSeries(); selectExercise("second")');
    assert.equal(s.run('currentExercise.id'), 'test');
    assert.equal(s.run('trueExamIndex'), 0);
    s.context.fetch = async () => ({ text: async () => '{"success":true}' });
    await s.run('runCode()');
    assert.equal(s.run('currentExercise.id'), 'test');
    assert.equal(s.run('trueExamIndex'), 0);
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
