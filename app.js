const chipsContainer = document.getElementById("exercise-chips");
const levelFiltersEl = document.getElementById("level-filters");
const examTitleEl = document.getElementById("exam-title");

const statementEl = document.getElementById("exercise-content");
const modeExamEl = document.getElementById("mode-exam");
const modeTrueExamEl = document.getElementById("mode-true-exam");
const modeLearningEl = document.getElementById("mode-learning");
const modeInputs = Array.from(document.querySelectorAll('input[name="app-mode"]'));
const modeSwitchEl = document.querySelector(".mode-switch");
const trackInputs = Array.from(document.querySelectorAll('input[name="track-mode"]'));
const trackSwitchEl = document.querySelector(".track-switch");
const editorTabLabelEl = document.getElementById("editor-tab-label");
const trueExamNextBtn = document.getElementById("true-exam-next");
const trueExamRestartBtn = document.getElementById("true-exam-restart");
const trueExamFinishBtn = document.getElementById("true-exam-finish");
const trueExamResultsEl = document.getElementById("true-exam-results");
const trueExamResultsTitleEl = document.getElementById("true-exam-results-title");
const trueExamResultSummaryEl = document.getElementById("true-exam-result-summary");
const trueExamResultStatsEl = document.getElementById("true-exam-result-stats");
const trueExamResultStorageEl = document.getElementById("true-exam-result-storage");
const trueExamResultRowsEl = document.getElementById("true-exam-result-rows");
const trueExamEditorHintEl = document.getElementById("true-exam-editor-hint");
const trueExamProgressEl = document.getElementById("true-exam-progress");
const trueExamStartBtn = document.getElementById("true-exam-start");
const trueExamPreparationEl = document.getElementById("true-exam-preparation");
const trueExamPreparationTrackEl = document.getElementById("true-exam-preparation-track");
const trueExamHeaderEl = document.getElementById("true-exam-header");
const trueExamHeaderTrackEl = document.getElementById("true-exam-header-track");
const trueExamTimerEl = document.getElementById("true-exam-timer");
const trueExamExpiredEl = document.getElementById("true-exam-expired");
const trueExamStatusEl = document.getElementById("true-exam-status");
const learningContentEl = document.getElementById("learning-content");
const learningLessonsEl = document.getElementById("learning-lessons");
const appEl = document.getElementById("app");

const codeEditorEl = document.getElementById("code-editor");
const outputEl = document.getElementById("output");
const highlightedEl = document.getElementById("highlighted-code");
const lineNumbersEl = document.getElementById("line-numbers-text");
const editorWrapperEl = document.querySelector(".editor-wrapper");

const runBtn = document.getElementById("run-btn");
const clearBtn = document.getElementById("clear-console");

// Support pour la touche Tab dans le mini-IDE :
// - Tab : insère une tabulation ou indente la sélection
// - Shift+Tab : désindente la sélection
codeEditorEl.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const el = this;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const value = el.value;

        // Pas de sélection : insérer une tabulation simple
        if (start === end) {
            const tab = '\t';
            el.value = value.slice(0, start) + tab + value.slice(end);
            el.selectionStart = el.selectionEnd = start + tab.length;
            updateHighlight();
            return;
        }

        // Sélection multiple : indenter / désindenter chaque ligne
        const selected = value.slice(start, end);
        const before = value.slice(0, start);
        const after = value.slice(end);

        if (e.shiftKey) {
            // Désindenter : enlever une tabulation ou jusqu'à 4 espaces en début de ligne
            const lines = selected.split('\n');
            const newLines = lines.map(l => {
                if (l.startsWith('\t')) return l.slice(1);
                return l.replace(/^ {1,4}/, '');
            });
            const newSelected = newLines.join('\n');
            el.value = before + newSelected + after;
            const removed = selected.length - newSelected.length;
            el.selectionStart = start;
            el.selectionEnd = end - removed;
            updateHighlight();
        } else {
            // Indenter : préfixer chaque ligne par une tabulation
            const lines = selected.split('\n');
            const newSelected = lines.map(l => '\t' + l).join('\n');
            el.value = before + newSelected + after;
            el.selectionStart = start;
            el.selectionEnd = end + (newSelected.length - selected.length);
            updateHighlight();
        }
    }
});

// Auto-closing pairs: when typing an opening char, insert the closing one and place caret between.
codeEditorEl.addEventListener('keydown', function (e) {
    // Ignore shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const pairs = {
        '(': ')',
        '[': ']',
        '{': '}',
        '"': '"',
        "'": "'",
        '`': '`'
    };

    const opening = Object.keys(pairs);
    const closing = Object.values(pairs);

    const el = this;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;

    // Backspace: if directly between an empty pair like (|) or "|" delete both
    if (e.key === 'Backspace') {
        if (start === end && start > 0 && start < val.length) {
            const prev = val[start - 1];
            const next = val[start];
            if (pairs[prev] && pairs[prev] === next) {
                e.preventDefault();
                el.value = val.slice(0, start - 1) + val.slice(start + 1);
                el.selectionStart = el.selectionEnd = start - 1;
                updateHighlight();
                return;
            }
        }
        return;
    }

    // Delete: if cursor before a closing and after its opening, remove both
    if (e.key === 'Delete') {
        if (start === end && start < val.length && start > 0) {
            const prev = val[start - 1];
            const next = val[start];
            if (pairs[prev] && pairs[prev] === next) {
                e.preventDefault();
                el.value = val.slice(0, start - 1) + val.slice(start + 1);
                el.selectionStart = el.selectionEnd = start - 1;
                updateHighlight();
                return;
            }
        }
        return;
    }

    // Opening char: insert pair unless heuristics say otherwise
    if (opening.includes(e.key)) {
        const prevChar = val[start - 1] || '';
        // Heuristic: for quotes/backticks, don't auto-pair if previous char is alphanumeric or underscore
        if ((e.key === '"' || e.key === "'" || e.key === '`') && /[0-9A-Za-z_]/.test(prevChar)) {
            return; // insert normally
        }
        // Don't auto-pair if previous is backslash (escaped)
        if (prevChar === '\\') {
            return;
        }

        e.preventDefault();
        const close = pairs[e.key];
        if (start !== end) {
            // wrap selection
            const selected = val.slice(start, end);
            el.value = val.slice(0, start) + e.key + selected + close + val.slice(end);
            el.selectionStart = start + 1;
            el.selectionEnd = end + 1;
        } else {
            // insert pair and place caret between
            el.value = val.slice(0, start) + e.key + close + val.slice(end);
            el.selectionStart = el.selectionEnd = start + 1;
        }
        updateHighlight();
        return;
    }

    // Closing char: if next char is same and not escaped, skip over it
    if (closing.includes(e.key)) {
        if (start === end && val[start] === e.key) {
            const prevChar = val[start - 1] || '';
            if (prevChar !== '\\') {
                e.preventDefault();
                el.selectionStart = el.selectionEnd = start + 1;
                return;
            }
        }
        return; // default insertion
    }
});

// --- Simple Go syntax highlighter (lightweight) ---
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightGo(code) {
    // escape first
    let src = escapeHtml(code);

    // preserve HTML entities so further passes don't break &lt; etc.
    const entities = [];
    const protectEntity = (match) => {
        const id = `@@@E${entities.length}@@@`;
        entities.push(match);
        return id;
    };
    src = src.replace(/&(lt|gt|amp);/g, protectEntity);

    // store protected tokens (strings/comments) to avoid re-highlighting inside them
    const tokens = [];
    const protect = (match, cls) => {
        const html = `<span class="${cls}">${match}</span>`;
        const id = `@@@T${tokens.length}@@@`;
        tokens.push(html);
        return id;
    };

    // block comments
    src = src.replace(/\/\*[\s\S]*?\*\//g, m => protect(m, 'tok-comment'));
    // line comments
    src = src.replace(/\/\/.*$/gm, m => protect(m, 'tok-comment'));
    // raw string `...`
    src = src.replace(/`[\s\S]*?`/g, m => protect(m, 'tok-string'));
    // double and single quoted strings
    src = src.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, m => protect(m, 'tok-string'));

    const keywords = [
        'package','import','func','var','const','for','range','if','else','switch','case','return',
        'struct','type','map','chan','go','defer','interface','select','break','continue','default','goto'
    ];
    const typeWords = ['int','string','bool','byte','rune','error','true','false','nil'];

    const reservedForFunctions = new Set([...keywords, ...typeWords]);
    const reservedIdentifiers = new Set([...keywords, ...typeWords]);

    const functionPlaceholders = [];
    const variablePlaceholders = [];

    const makeFunctionPlaceholder = (name) => {
        const id = `@@@F${functionPlaceholders.length}@@@`;
        functionPlaceholders.push(name);
        return id;
    };

    const makeVariablePlaceholder = (name) => {
        const id = `@@@V${variablePlaceholders.length}@@@`;
        variablePlaceholders.push(name);
        return id;
    };

    const isPlaceholder = (str, offset, len) => {
        if (offset < 3 || offset + len + 3 > str.length) return false;
        return str.slice(offset - 3, offset) === '@@@' && str.slice(offset + len, offset + len + 3) === '@@@';
    };

    // Highlight function/method names (before keywords)
    src = src.replace(/(\.)([A-Za-z_]\w*)(?=\s*\()/g, (m, dot, name) => {
        if (reservedForFunctions.has(name)) return m;
        return dot + makeFunctionPlaceholder(name);
    });
    src = src.replace(/(^|[^.\w])([A-Za-z_]\w*)(?=\s*\()/g, (m, prefix, name) => {
        if (reservedForFunctions.has(name)) return m;
        return prefix + makeFunctionPlaceholder(name);
    });

    // Highlight remaining identifiers as variables
    src = src.replace(/\b([A-Za-z_]\w*)\b/g, (match, name, offset, original) => {
        if (reservedIdentifiers.has(name)) return match;
        if (isPlaceholder(original, offset, match.length)) return match;
        return makeVariablePlaceholder(name);
    });

    const bracketPlaceholders = [];
    let bracketDepth = 0;
    let bracketed = '';
    const bracketClassForDepth = (depth) => {
        const mod = depth % 3;
        if (mod === 0) return 'tok-bracket-outer';
        if (mod === 1) return 'tok-bracket-middle';
        return 'tok-bracket-inner';
    };
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if ('([{'.includes(ch)) {
            const cls = bracketClassForDepth(bracketDepth);
            const id = `@@@B${bracketPlaceholders.length}@@@`;
            bracketPlaceholders.push(`<span class="${cls}">${ch}</span>`);
            bracketed += id;
            bracketDepth += 1;
            continue;
        }
        if (')]}'.includes(ch)) {
            bracketDepth = Math.max(0, bracketDepth - 1);
            const cls = bracketClassForDepth(bracketDepth);
            const id = `@@@B${bracketPlaceholders.length}@@@`;
            bracketPlaceholders.push(`<span class="${cls}">${ch}</span>`);
            bracketed += id;
            continue;
        }
        bracketed += ch;
    }
    src = bracketed;

    // keywords
    const kwRegex = new RegExp('\\b(' + keywords.join('|') + ')\\b', 'g');
    src = src.replace(kwRegex, (m) => {
        if (m === 'package') return '<span class="tok-package">package</span>';
        return '<span class="tok-keyword">' + m + '</span>';
    });

    // types / constants
    const typeRegex = new RegExp('\\b(' + typeWords.join('|') + ')\\b', 'g');
    src = src.replace(typeRegex, '<span class="tok-type">$1</span>');

    // numbers
    src = src.replace(/\b(0x[0-9a-fA-F]+|\d+\.?\d*|\d*\.\d+)\b/g, '<span class="tok-number">$1</span>');

    // package name (after "package")
    src = src.replace(/(<span class="tok-package">package<\/span>\s+)(@@@V(\d+)@@@|\b[A-Za-z_]\w*\b)/g, (m, prefix, ident, vIdx) => {
        let name = ident;
        if (vIdx !== undefined) {
            const resolved = variablePlaceholders[Number(vIdx)];
            if (resolved) name = resolved;
        }
        return `${prefix}<span class="tok-package-name">${name}</span>`;
    });

    // restore function and variable placeholders
    src = src.replace(/@@@F(\d+)@@@/g, (m, idx) => `<span class="tok-function">${functionPlaceholders[Number(idx)]}</span>`);
    src = src.replace(/@@@V(\d+)@@@/g, (m, idx) => `<span class="tok-variable">${variablePlaceholders[Number(idx)]}</span>`);

    // restore bracket placeholders
    src = src.replace(/@@@B(\d+)@@@/g, (m, idx) => bracketPlaceholders[Number(idx)]);

    // restore strings/comments
    src = src.replace(/@@@T(\d+)@@@/g, (m, n) => tokens[Number(n)]);

    // restore HTML entities
    src = src.replace(/@@@E(\d+)@@@/g, (m, idx) => entities[Number(idx)]);

    // italics for import package paths
    src = src.replace(/(<span class="tok-keyword">import<\/span>\s+(?:\w+\s+)?)<span class="tok-string">([\s\S]*?)<\/span>/g, (m, prefix, content) => {
        return `${prefix}<span class="tok-import">${content}</span>`;
    });

    return src;
}

function syncHighlightMetrics() {
    if (!highlightedEl) return;
    const computed = window.getComputedStyle(codeEditorEl);
    const props = [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'lineHeight',
        'letterSpacing'
    ];
    props.forEach(prop => {
        highlightedEl.style[prop] = computed[prop];
    });
    const tabSize = computed.getPropertyValue('tab-size');
    if (tabSize) {
        highlightedEl.style.setProperty('tab-size', tabSize);
    }
}

function updateHighlight() {
    if (!highlightedEl) return;
    const code = codeEditorEl.value;
    const html = highlightGo(code);
    // put inside <code> to keep semantics
    highlightedEl.querySelector('code').innerHTML = html + (code.endsWith('\n') ? '\n' : '');
    // sync scroll
    highlightedEl.scrollTop = codeEditorEl.scrollTop;
    highlightedEl.scrollLeft = codeEditorEl.scrollLeft;
    updateLineNumbers();
}

function updateLineNumbers() {
    if (!lineNumbersEl || !codeEditorEl) return;
    const code = codeEditorEl.value || "";
    const lines = code.split('\n');
    const count = Math.max(1, lines.length);
    lineNumbersEl.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
    lineNumbersEl.style.transform = `translateY(-${codeEditorEl.scrollTop}px)`;
}

function syncPlainEditorMode() {
    if (!editorWrapperEl || !codeEditorEl) return;
    const hasSelection = codeEditorEl.selectionStart !== codeEditorEl.selectionEnd;
    editorWrapperEl.classList.toggle('show-plain', hasSelection);
}

function schedulePlainEditorSync() {
    requestAnimationFrame(syncPlainEditorMode);
}

codeEditorEl.addEventListener('input', updateHighlight);
codeEditorEl.addEventListener('scroll', () => {
    if (highlightedEl) {
        highlightedEl.scrollTop = codeEditorEl.scrollTop;
        highlightedEl.scrollLeft = codeEditorEl.scrollLeft;
    }
    if (lineNumbersEl) {
        lineNumbersEl.style.transform = `translateY(-${codeEditorEl.scrollTop}px)`;
    }
});
codeEditorEl.addEventListener('select', syncPlainEditorMode);
codeEditorEl.addEventListener('mouseup', schedulePlainEditorSync);
codeEditorEl.addEventListener('keyup', schedulePlainEditorSync);
codeEditorEl.addEventListener('mousedown', () => {
    if (editorWrapperEl) editorWrapperEl.classList.add('show-plain');
});
codeEditorEl.addEventListener('blur', () => {
    if (editorWrapperEl) editorWrapperEl.classList.remove('show-plain');
});

updateLineNumbers();
syncHighlightMetrics();


let exercises = [];
let jsExercises = [];
let rustExercises = [];
let javaExercises = [];
let currentExercise = null;
let learningMode = false;
let currentLevelFilter = "all";
let trueExamMode = false;
let trueExamSeries = [];
let trueExamIndex = -1;
let exercisesLoaded = false;
const TRUE_EXAM_DURATION_MS = 3 * 60 * 60 * 1000;
let trueExamState = "ready";
let trueExamSession = null;
let trueExamTimerInterval = null;
// True Exam persistence state
const TRUE_EXAM_STORAGE_KEY = "z01exam-true-exam-session";
const TRUE_EXAM_REPORT_KEY = "z01exam-true-exam-report";
const TRUE_EXAM_FINISH_LABELS = {
    time_expired: "Temps écoulé : l’examen est terminé.",
    completed: "Tous les exercices ont été réussis.",
    submitted_early: "Examen remis avant la fin du temps prévu.",
    interruption_timeout: "L’interruption a dépassé cinq minutes."
};
let trueExamReport = null;
const TRUE_EXAM_RECOVERY_MS = 5 * 60 * 1000;
const trueExamPageId = crypto.randomUUID();
let trueExamTabId = trueExamPageId;
try {
    trueExamTabId = window.sessionStorage.getItem("z01exam-true-exam-tab") || trueExamPageId;
    window.sessionStorage.setItem("z01exam-true-exam-tab", trueExamTabId);
} catch { /* Session storage is optional; reload detection is conservative without it. */ }
let trueExamStorageOwned = false;
let trueExamStorageFailed = false;
let trueExamReleaseLock = null;
let trueExamSaveTimeout = null;
let trueExamRecoveryPending = false;
let trueExamRestorePromise = null;
let trueExamStarting = false;
let trueExamHistoryExit = null;
let trueExamHistoryGuard = null;
const TRUE_EXAM_HISTORY_KEY = "z01examTrueExam";
let trueExamSuspendedSessionId = null;
// End True Exam persistence state

let previousLevelFilter = "all";
let currentTrack = "go";
let goDraft = "";
let jsDraft = "";
let rustDraft = "";
let javaDraft = "";
const rustDefaultSnippet = `// Écris ta solution Rust ici.
`;
const javaDefaultSnippet = `public class ExerciseRunner {
    // Écris ta solution Java ici.
}
`;
const jsDefaultSnippet = `// Module JS en préparation.
function main() {
\tconsole.log("Piscine JS: bientôt disponible.");
}

main();
`;
const jsPlaceholderExercises = Array.from({ length: 10 }, (_, idx) => {
    const level = idx + 1;
    return {
        id: `js-level-${level}`,
        title: `JS Niveau ${level}`,
        level,
        statement: `
# JS Niveau ${level}

Exercice placeholder pour la piste JS.

- Ce niveau est prêt côté interface (Exam / True Exam).
- Le contenu final et les tests JS seront branchés ensuite.

\`\`\`js
function solve(input) {
  return input;
}
\`\`\`
`
    };
});
const jsLearningLessons = [
    {
        id: "JS-01",
        title: "Bases JavaScript",
        content: `
# JS Learning 01

- Variables: \`let\`, \`const\`
- Fonctions
- Tableaux et objets
`
    },
    {
        id: "JS-02",
        title: "Algo & Strings",
        content: `
# JS Learning 02

- Boucles
- Transformations de chaînes
- Comparaison de sorties pour les exercices
`
    },
    {
        id: "JS-03",
        title: "Préparation Piscine",
        content: `
# JS Learning 03

- Lire l'énoncé attentivement
- Écrire des cas simples d'abord
- Itérer vers les cas limites
`
    }
];

const LEVEL_SPECS = {
    1: ["onlyz", "onlya", "onlyb", "onlyf", "only1"],
    2: [
        "rectperimeter",
        "countcharacter",
        "checknumber",
        "countalpha",
        "printf",
        "printfnot",
        "retainfirsthalf"
    ],
    3: [
        "digitlen",
        "fishandchips",
        "cameltosnakecase",
        "gcd",
        "hash-code",
        "lastword",
        "firstword",
        "repeatalpha",
        "searchreplace"
    ],
    4: [
        "findprevprime",
        "thirdtimeisacharm",
        "printrevcomb",
        "printmemory",
        "weareunique",
        "itoa",
        "iscapitalized",
        "fromto",
        "zipstring",
        "expandstr",
        "cleanstr"
    ],
    5: [
        "concatalternate",
        "reversestrcap",
        "wdmatch",
        "hiddenp",
        "concatslice",
        "inter",
        "union",
        "saveandmiss",
        "chunk",
        "addprimesum",
        "fprime",
        "canjump"
    ],
    6: ["notdecimal", "slice", "fifthandskip", "revconcatalternate"],
    7: ["wordflip", "revwstr", "rostring", "findpairs"],
    8: ["options", "romannumbers", "piglatin", "itoabase"],
    9: ["rpncalc", "brackets"],
    10: ["brainfuck", "grouping"]
};

const LEVEL_ALIASES = {
    printf: "printif",
    printfnot: "printifnot",
    "hash-code": "hashcode"
};

const LEVEL_MAP = (() => {
    const map = {};
    Object.entries(LEVEL_SPECS).forEach(([level, ids]) => {
        ids.forEach((id) => {
            const key = normalizeExerciseId(id);
            const alias = LEVEL_ALIASES[key] || LEVEL_ALIASES[id] || id;
            const resolved = normalizeExerciseId(alias);
            if (resolved) {
                map[resolved] = Number(level);
            }
        });
    });
    return map;
})();
const defaultLearningMd = `
# Mode learning

Ajoutez vos notes ou fiches Markdown dans \`window.LEARNING_MD\` pour alimenter ce panneau.

- Conçu pour réviser avant de lancer les tests.
- Vous pouvez inclure du code, des listes ou des rappels rapides.
`;
let learningSource = typeof window !== "undefined" ? window.LEARNING_MD : "";
const defaultLessonMsg = "Sélectionne une leçon dans la liste pour afficher son contenu.";
let learningManifest = null;
let learningLessons = [];
let learningCurrentLessonId = null;
let jsLearningCurrentLessonId = null;
let learningLoaded = false;
const learningLessonCache = {};

function slugify(str) {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-");
}

function updateModeLabel() {
    if (!modeInputs.length) return;
    const mode = learningMode ? "learning" : (trueExamMode ? "true-exam" : "exam");
    modeInputs.forEach((input) => {
        input.checked = input.value === mode;
    });
    if (modeSwitchEl) {
        modeSwitchEl.classList.remove("is-exam", "is-true-exam", "is-learning");
        modeSwitchEl.classList.add(
            mode === "learning" ? "is-learning" : (mode === "true-exam" ? "is-true-exam" : "is-exam")
        );
    }
}

function isJsTrack() {
    return currentTrack === "js";
}

function isRustTrack() {
    return currentTrack === "rust";
}

function isJavaTrack() {
    return currentTrack === "java";
}

function getTrackExercises() {
    if (isJsTrack()) {
        return jsExercises.length ? jsExercises : jsPlaceholderExercises;
    }
    if (isRustTrack()) {
        return rustExercises;
    }
    if (isJavaTrack()) {
        return javaExercises;
    }
    return exercises;
}

function updateTrackLabel() {
    if (trackInputs.length) {
        trackInputs.forEach((input) => {
            input.checked = input.value === currentTrack;
        });
    }
    if (trackSwitchEl) {
        trackSwitchEl.classList.toggle("is-js", isJsTrack());
        trackSwitchEl.classList.toggle("is-rust", isRustTrack());
        trackSwitchEl.classList.toggle("is-java", isJavaTrack());
    }
}

function updateTrackDependentUi() {
    const jsMode = isJsTrack();
    const rustMode = isRustTrack();
    const javaMode = isJavaTrack();
    if (appEl) {
        appEl.classList.toggle("js-track-mode", jsMode);
        appEl.classList.toggle("rust-track-mode", rustMode);
        appEl.classList.toggle("java-track-mode", javaMode);
    } else {
        document.body.classList.toggle("js-track-mode", jsMode);
    }

    if (editorTabLabelEl) {
        editorTabLabelEl.textContent = jsMode ? "js main.js" : (rustMode ? "rust lib.rs" : (javaMode ? "java ExerciseRunner.java" : "go main.go"));
    }

    if (runBtn) {
        runBtn.disabled = false;
        runBtn.title = "";
    }
    const source = getTrackExercises();
    const hasCurrent = currentExercise && source.some((ex) => exId(ex) === exId(currentExercise));
    if (!hasCurrent) {
        currentExercise = null;
    }

    if (trueExamMode) {
        if (trueExamState !== "running") prepareTrueExam();
        updateTrueExamControls();
    } else if (!learningMode) {
        renderLevelFilters();
        renderChips();
        const filtered = getFilteredExercises();
        if (currentExercise && filtered.some((ex) => exId(ex) === exId(currentExercise))) {
            setActiveExerciseChip(exId(currentExercise));
            updateExerciseHeader(currentExercise);
            const rendered = markdownToHtml(exStatement(currentExercise));
            statementEl.innerHTML = rendered || "Contenu Markdown indisponible pour cet exercice.";
            highlightMarkdownCode(statementEl);
        } else if (filtered.length) {
            selectExercise(exId(filtered[0]));
        } else {
            examTitleEl.textContent = "Sélectionne un exercice";
            statementEl.innerHTML = "Aucun exercice disponible pour ce mode.";
        }
    } else {
        setLearningMode(true);
    }

    codeEditorEl.value = jsMode ? (jsDraft.trim() ? jsDraft : jsDefaultSnippet) : (rustMode ? (rustDraft.trim() ? rustDraft : rustDefaultSnippet) : (javaMode ? (javaDraft.trim() ? javaDraft : javaDefaultSnippet) : goDraft));
    updateHighlight();
}

function setTrackMode(mode) {
    if (trueExamReport && trueExamMode) { updateTrackLabel(); return; }
    if (trueExamRecoveryPending) { updateTrackLabel(); return; }
    if (trueExamMode && trueExamState === "running") {
        refreshTrueExamTimer();
        updateTrackLabel();
        return;
    }
    const normalized = (mode || "go").toString().toLowerCase();
    const nextTrack = normalized === "js" ? "js" : (normalized === "rust" ? "rust" : (normalized === "java" ? "java" : "go"));
    if (nextTrack === currentTrack) {
        updateTrackLabel();
        updateTrackDependentUi();
        return;
    }

    if (currentTrack === "js") {
        jsDraft = codeEditorEl.value;
    } else if (currentTrack === "rust") {
        rustDraft = codeEditorEl.value;
    } else if (currentTrack === "java") {
        javaDraft = codeEditorEl.value;
    } else {
        goDraft = codeEditorEl.value;
    }

    currentTrack = nextTrack;
    try {
        window.localStorage.setItem("z02intra-track-mode", currentTrack);
    } catch {
        // noop
    }
    updateTrackLabel();
    updateTrackDependentUi();
}

function setAppMode(mode) {
    const normalized = (mode || "exam").toString().toLowerCase();
    if (trueExamRecoveryPending) { updateModeLabel(); return; }
    if (trueExamMode && normalized === "true-exam") {
        updateModeLabel();
        return;
    }
    if (trueExamMode && trueExamState === "running") {
        refreshTrueExamTimer();
        if (trueExamState === "running" && !window.confirm("Quitter l’examen ? La session en cours sera terminée.")) {
            updateModeLabel();
            return;
        }
    }
    if (normalized === "learning") {
        setTrueExamMode(false);
        setLearningMode(true);
        return;
    }
    if (normalized === "true-exam") {
        setLearningMode(false);
        setTrueExamMode(true);
        return;
    }
    setLearningMode(false);
    setTrueExamMode(false);
}

function createTrueExamResults(ids) {
    return Object.fromEntries(ids.map(id => [id, { attempts: 0, success: false }]));
}

function validTrueExamResults(ids, results) {
    return results && typeof results === "object" && !Array.isArray(results) &&
        Object.keys(results).length === ids.length && ids.every(id => {
            const result = results[id];
            return result && Number.isSafeInteger(result.attempts) && result.attempts >= 0 &&
                result.attempts <= Number.MAX_SAFE_INTEGER / 10 && typeof result.success === "boolean" &&
                (!result.success || result.attempts > 0);
        });
}

function summarizeTrueExamResults(rows, startedAt, completedAt, endsAt) {
    return {
        successful: rows.filter(row => row.success).length,
        unsuccessful: rows.filter(row => !row.success && row.attempts > 0).length,
        unattempted: rows.filter(row => row.attempts === 0).length,
        submissions: rows.reduce((count, row) => count + row.attempts, 0),
        usedMs: Math.max(0, Math.min(completedAt, endsAt) - startedAt),
        durationMs: endsAt - startedAt
    };
}

function validateTrueExamReport(report, expectedId) {
    if (!report || report.version !== 1 || report.id !== expectedId ||
        !["go", "js", "rust", "java"].includes(report.track) ||
        !Object.hasOwn(TRUE_EXAM_FINISH_LABELS, report.reason) ||
        !Number.isSafeInteger(report.startedAt) || report.startedAt < 0 ||
        !Number.isSafeInteger(report.endsAt) || report.endsAt - report.startedAt !== TRUE_EXAM_DURATION_MS ||
        !Number.isSafeInteger(report.completedAt) || report.completedAt < report.startedAt ||
        report.completedAt > Math.min(report.endsAt, Date.now()) ||
        !Array.isArray(report.exerciseIds) || !report.exerciseIds.length || report.exerciseIds.length > 10 ||
        report.exerciseIds.some(id => typeof id !== "string" || !id) ||
        new Set(report.exerciseIds).size !== report.exerciseIds.length ||
        !Array.isArray(report.results) || report.results.length !== report.exerciseIds.length ||
        report.results.some((row, index) => !row || row.id !== report.exerciseIds[index] ||
            typeof row.title !== "string" || !(row.level === null || Number.isFinite(row.level))) ||
        !validTrueExamResults(report.exerciseIds, Object.fromEntries(report.results.map(row => [row.id, row]))) ||
        (report.reason === "completed" && report.results.some(row => !row.success)) ||
        (report.reason === "time_expired" && report.completedAt !== report.endsAt)) {
        throw new Error("Le bilan sauvegardé est invalide ou incompatible.");
    }
    const summary = summarizeTrueExamResults(report.results, report.startedAt, report.completedAt, report.endsAt);
    if (!report.summary || Object.keys(summary).some(key => report.summary[key] !== summary[key])) {
        throw new Error("Les statistiques du bilan sauvegardé sont incohérentes.");
    }
    return report;
}

function readTrueExamReport(id) {
    const raw = window.localStorage.getItem(TRUE_EXAM_REPORT_KEY);
    if (raw === null) return null;
    const report = JSON.parse(raw);
    return report?.id === id ? validateTrueExamReport(report, id) : null;
}

function renderTrueExamReport(report) {
    trueExamResultSummaryEl.textContent = `${report.summary.successful} / ${report.exerciseIds.length} exercices réussis`;
    trueExamResultStatsEl.replaceChildren();
    const stats = [
        ["Langage", report.track.toUpperCase()],
        ["Exercices réussis", report.summary.successful],
        ["Évalués sans réussite", report.summary.unsuccessful],
        ["Non tentés", report.summary.unattempted],
        ["Soumissions évaluées", report.summary.submissions],
        ["Temps utilisé", formatTrueExamTime(report.summary.usedMs)],
        ["Durée prévue", formatTrueExamTime(report.summary.durationMs)],
        ["Fin de l’examen", TRUE_EXAM_FINISH_LABELS[report.reason]]
    ];
    for (const [label, value] of stats) {
        const term = document.createElement("dt");
        const detail = document.createElement("dd");
        term.textContent = label;
        detail.textContent = String(value);
        trueExamResultStatsEl.append(term, detail);
    }
    trueExamResultRowsEl.replaceChildren();
    for (const result of report.results) {
        const row = document.createElement("tr");
        const values = [result.title, result.level === null ? "—" : String(result.level),
            result.success ? "Réussi" : (result.attempts > 0 ? "Non réussi" : "Non tenté"), String(result.attempts)];
        for (const value of values) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        }
        trueExamResultRowsEl.appendChild(row);
    }
}

function showTrueExamReport(report) {
    cancelTrueExamSave();
    stopTrueExamTimer();
    trueExamReport = report;
    trueExamState = "finished";
    trueExamMode = true;
    learningMode = false;
    currentTrack = report.track;
    updateTrackLabel();
    trueExamRecoveryPending = false;
    trueExamSuspendedSessionId = null;
    trueExamSession = {
        id: report.id, track: report.track, startedAt: report.startedAt, endsAt: report.endsAt,
        completedAt: report.completedAt, finishReason: report.reason,
        drafts: Object.create(null), results: Object.fromEntries(report.results.map(row => [row.id, {attempts: row.attempts, success: row.success}]))
    };
    currentExercise = null;
    codeEditorEl.value = "";
    outputEl.textContent = "";
    updateHighlight();
    appEl.classList.toggle("true-exam-mode", true);
    appEl.classList.toggle("learning-mode", false);
    trueExamExpiredEl.textContent = TRUE_EXAM_FINISH_LABELS[report.reason];
    trueExamResultStorageEl.textContent = trueExamStorageFailed
        ? "Le stockage local est indisponible : ce bilan pourrait être perdu après rechargement." : "";
    refreshTrueExamTimer();
    renderTrueExamReport(report);
    updateModeLabel();
    updateTrueExamControls();
    releaseTrueExamOwnership();
    trueExamResultsTitleEl.focus();
}

function finishTrueExamSession(reason, completedAt = Date.now(), restoredCompletion = false) {
    if (!trueExamSession || trueExamState !== "running" || !Object.hasOwn(TRUE_EXAM_FINISH_LABELS, reason)) return false;
    if (!ownsTrueExamSnapshot()) return false;
    if (!restoredCompletion && Date.now() >= trueExamSession.endsAt) {
        reason = "time_expired";
        completedAt = trueExamSession.endsAt;
    }
    const session = trueExamSession;
    const rows = trueExamSeries.map(ex => ({
        id: exId(ex), title: String(exTitle(ex)), level: Number.isFinite(ex.level) ? ex.level : null,
        ...session.results[exId(ex)]
    }));
    const report = {
        version: 1, id: session.id, track: session.track, exerciseIds: rows.map(row => row.id), results: rows,
        startedAt: session.startedAt, completedAt: Math.max(session.startedAt, Math.min(completedAt, session.endsAt)),
        endsAt: session.endsAt, reason
    };
    report.summary = summarizeTrueExamResults(rows, report.startedAt, report.completedAt, report.endsAt);
    trueExamState = "finished"; // Close the acceptance window before storage or rendering.
    session.finishReason = reason;
    session.completedAt = report.completedAt;
    cancelTrueExamSave();
    stopTrueExamTimer();
    trueExamReport = report;
    try { window.localStorage.setItem(TRUE_EXAM_REPORT_KEY, JSON.stringify(report)); }
    catch { trueExamStorageWarning(); }
    saveTrueExamSession();
    showTrueExamReport(report);
    return true;
}

function recordTrueExamEvaluation(session, exerciseId, success) {
    if (session !== trueExamSession || !canRunTrueExam()) return;
    const result = session.results[exerciseId];
    if (!result) return;
    result.attempts += 1;
    result.success ||= success;
    saveTrueExamSession();
    if (Object.values(session.results).every(result => result.success)) finishTrueExamSession("completed");
}

function submitTrueExamEarly() {
    if (!canRunTrueExam()) return;
    const session = trueExamSession;
    if (!window.confirm("Terminer définitivement l’examen ? Les exercices non réussis resteront incomplets. Un bilan sera généré et l’examen ne pourra plus être repris.")) return;
    if (session === trueExamSession && canRunTrueExam()) finishTrueExamSession("submitted_early");
}

function dismissTrueExamReport() {
    if (!trueExamReport) return;
    try {
        const snapshot = readTrueExamSnapshot();
        if (snapshot?.id === trueExamReport.id && snapshot.status === "finished") window.localStorage.removeItem(TRUE_EXAM_STORAGE_KEY);
    } catch { trueExamStorageWarning(); }
    trueExamReport = null; // The independent final report is retained in localStorage.
}

function newTrueExamFromReport() {
    if (!trueExamReport) return;
    dismissTrueExamReport();
    clearTrueExamMemory();
    updateTrackDependentUi();
}

function trueExamStorageWarning() {
    trueExamStorageFailed = true;
    outputEl.textContent = "Sauvegarde locale indisponible : l’examen continue, mais la reprise n’est pas garantie.";
}

function readTrueExamSnapshot() {
    let raw;
    try { raw = window.localStorage.getItem(TRUE_EXAM_STORAGE_KEY); }
    catch { trueExamStorageWarning(); return null; }
    if (raw === null) return null;
    const snapshot = JSON.parse(raw);
    if (snapshot === null) throw new Error("La sauvegarde de l’examen est invalide.");
    return snapshot;
}

function isAbandonedTrueExamSnapshot(snapshot) {
    return [1, 2].includes(snapshot?.version) && typeof snapshot.id === "string" && snapshot.id.length > 0 &&
        snapshot.status === "finished" && snapshot.finishReason === "abandoned";
}

function validateTrueExamSnapshot(snapshot) {
    // Abandonment retains only an identity marker, never code or exercise progress.
    if (isAbandonedTrueExamSnapshot(snapshot)) return snapshot;
    if (snapshot?.version === 2 && typeof snapshot.id === "string" && snapshot.id && snapshot.status === "finished" &&
        Object.hasOwn(TRUE_EXAM_FINISH_LABELS, snapshot.finishReason)) return snapshot;
    const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= Date.now();
    if (!snapshot || ![1, 2].includes(snapshot.version) || typeof snapshot.id !== "string" || !snapshot.id ||
        !["go", "js", "rust", "java"].includes(snapshot.track) ||
        !Array.isArray(snapshot.exerciseIds) || !snapshot.exerciseIds.length || snapshot.exerciseIds.length > 10 ||
        snapshot.exerciseIds.some(id => typeof id !== "string" || !id) ||
        new Set(snapshot.exerciseIds).size !== snapshot.exerciseIds.length ||
        !Number.isInteger(snapshot.index) || snapshot.index < 0 || snapshot.index >= snapshot.exerciseIds.length ||
        snapshot.exerciseId !== snapshot.exerciseIds[snapshot.index] || typeof snapshot.code !== "string" ||
        !timestamp(snapshot.startedAt) || !Number.isSafeInteger(snapshot.endsAt) ||
        snapshot.endsAt - snapshot.startedAt !== TRUE_EXAM_DURATION_MS ||
        !timestamp(snapshot.savedAt) || snapshot.savedAt < snapshot.startedAt ||
        !["running", "finished"].includes(snapshot.status) ||
        ![null, "expired", "interruption", "abandoned", ...Object.keys(TRUE_EXAM_FINISH_LABELS)].includes(snapshot.finishReason) ||
        (snapshot.status === "running" && snapshot.finishReason !== null) ||
        typeof snapshot.tabId !== "string" || !snapshot.tabId ||
        !(snapshot.ownerId === null || typeof snapshot.ownerId === "string") ||
        !(snapshot.interruptedAt === null || (timestamp(snapshot.interruptedAt) && snapshot.interruptedAt >= snapshot.startedAt)) ||
        !snapshot.drafts || typeof snapshot.drafts !== "object" || Array.isArray(snapshot.drafts) ||
        Object.entries(snapshot.drafts).some(([id, code]) => !snapshot.exerciseIds.includes(id) || typeof code !== "string") ||
        snapshot.drafts[snapshot.exerciseId] !== snapshot.code) {
        throw new Error("La sauvegarde de l’examen est invalide ou utilise une version incompatible.");
    }
    if (snapshot.version === 1) {
        // v1 never recorded grading history: migrate honestly as unattempted.
        return { ...snapshot, version: 2, results: createTrueExamResults(snapshot.exerciseIds),
            finishReason: {expired: "time_expired", interruption: "interruption_timeout"}[snapshot.finishReason] || snapshot.finishReason };
    }
    if (!validTrueExamResults(snapshot.exerciseIds, snapshot.results)) throw new Error("Les résultats sauvegardés sont invalides.");
    return snapshot;
}

function releaseTrueExamOwnership() {
    trueExamStorageOwned = false;
    if (trueExamReleaseLock) trueExamReleaseLock();
    trueExamReleaseLock = null;
}

async function acquireTrueExamOwnership() {
    if (trueExamStorageOwned) return true;
    if (navigator.locks?.request) {
        // The callback holds the lock until pagehide or an explicit exit; hidden tabs keep it.
        return new Promise(resolve => {
            navigator.locks.request(TRUE_EXAM_STORAGE_KEY, { ifAvailable: true }, lock => {
                if (!lock) { resolve(false); return; }
                trueExamStorageOwned = true;
                return new Promise(release => {
                    trueExamReleaseLock = release;
                    resolve(true);
                });
            }).catch(() => resolve(false));
        });
    }
    // Conservative fallback: never take an unmarked session from a different tab.
    try {
        const snapshot = readTrueExamSnapshot();
        if (snapshot?.ownerId && snapshot.ownerId !== trueExamPageId && snapshot.tabId !== trueExamTabId) return false;
    } catch {
        // Storage failures must not prevent an in-memory exam.
    }
    trueExamStorageOwned = true;
    return true;
}

function clearTrueExamMemory() {
    cancelTrueExamSave();
    stopTrueExamTimer();
    const track = trueExamSession?.track;
    if (trueExamSession) trueExamSession.drafts = Object.create(null);
    trueExamReport = null;
    trueExamSession = null; // Invalidate all pending evaluation responses.
    trueExamSeries = [];
    trueExamIndex = -1;
    currentExercise = null;
    trueExamState = "finished";
    trueExamRecoveryPending = false;
    trueExamHistoryExit = null;
    if (track === "go") goDraft = "";
    if (track === "js") jsDraft = "";
    if (track === "rust") rustDraft = "";
    if (track === "java") javaDraft = "";
    codeEditorEl.value = "";
    outputEl.textContent = "";
    statementEl.textContent = "";
    updateHighlight();
}

function loseTrueExamOwnership() {
    clearTrueExamMemory();
    releaseTrueExamOwnership();
    trueExamExpiredEl.textContent = "Cette session est utilisée ou a été terminée dans un autre onglet. Recharge la page pour vérifier son état.";
    updateTrueExamControls();
}

function ownsTrueExamSnapshot() {
    if (!trueExamStorageOwned) return false;
    try {
        const snapshot = trueExamStorageFailed ? null : readTrueExamSnapshot();
        if (snapshot && trueExamSession && (snapshot.id !== trueExamSession.id ||
            (snapshot.ownerId && snapshot.ownerId !== trueExamPageId) ||
            (snapshot.status === "finished" && trueExamState === "running" && !trueExamRecoveryPending))) {
            loseTrueExamOwnership();
            return false;
        }
    } catch {
        trueExamStorageWarning();
    }
    return true;
}

function cancelTrueExamSave() {
    if (trueExamSaveTimeout !== null) clearTimeout(trueExamSaveTimeout);
    trueExamSaveTimeout = null;
}

function rememberTrueExamCode() {
    if (trueExamSession && currentExercise && trueExamSeries.some(ex => exId(ex) === exId(currentExercise))) {
        trueExamSession.drafts[exId(currentExercise)] = codeEditorEl.value;
    }
}

function saveTrueExamSession(interruptedAt = null) {
    cancelTrueExamSave();
    if (!trueExamSession || !ownsTrueExamSnapshot()) return;
    rememberTrueExamCode();
    const snapshot = trueExamSession.finishReason === "abandoned"
        ? { version: 2, id: trueExamSession.id, status: "finished", finishReason: "abandoned" }
        : trueExamState === "finished" && trueExamReport
            ? { version: 2, id: trueExamSession.id, status: "finished", finishReason: trueExamSession.finishReason }
            : {
        version: 2, id: trueExamSession.id, track: trueExamSession.track,
        exerciseIds: trueExamSeries.map(exId), index: trueExamIndex,
        exerciseId: exId(currentExercise || {}), code: codeEditorEl.value,
        results: trueExamSession.results, drafts: trueExamSession.drafts, startedAt: trueExamSession.startedAt, endsAt: trueExamSession.endsAt,
        status: trueExamState, finishReason: trueExamSession.finishReason || null,
        savedAt: Date.now(), interruptedAt, tabId: trueExamTabId,
        ownerId: interruptedAt === null ? trueExamPageId : null
    };
    try {
        window.localStorage.setItem(TRUE_EXAM_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
        trueExamStorageWarning();
        if (trueExamSession.finishReason === "abandoned") {
            try { window.localStorage.removeItem(TRUE_EXAM_STORAGE_KEY); } catch { /* Storage may be entirely inaccessible. */ }
        }
    }
}

function scheduleTrueExamSave() {
    if (!trueExamMode || trueExamState !== "running" || !trueExamSession) return;
    rememberTrueExamCode();
    cancelTrueExamSave();
    trueExamSaveTimeout = setTimeout(saveTrueExamSession, 250);
}

function abandonTrueExamSession() {
    if (trueExamSession && trueExamState === "running") {
        trueExamState = "finished";
        trueExamSession.finishReason = "abandoned";
        saveTrueExamSession(); // Terminal tombstone prevents an older tab from resurrecting the exam.
        clearTrueExamMemory();
    } else if (trueExamSession) {
        clearTrueExamMemory();
    } else {
        cancelTrueExamSave();
        stopTrueExamTimer();
    }
    trueExamSuspendedSessionId = null;
    trueExamHistoryExit = null;
    releaseTrueExamOwnership();
}

function failTrueExamRecovery(message) {
    clearTrueExamMemory();
    trueExamSuspendedSessionId = null;
    releaseTrueExamOwnership();
    trueExamExpiredEl.textContent = message;
    statementEl.textContent = "La sauvegarde n’a pas été remplacée par un nouvel examen.";
    updateTrueExamControls();
}

function recoveryNavigationType() {
    return performance.getEntriesByType("navigation")[0]?.type || "navigate";
}

async function restoreTrueExamSession(expectedId = null) {
    if (trueExamRestorePromise) return trueExamRestorePromise;
    trueExamRestorePromise = (async () => {
        try {
            if (!await acquireTrueExamOwnership()) throw new Error("L’examen est déjà ouvert dans un autre onglet. Reviens dans cet onglet pour continuer.");
            const snapshot = validateTrueExamSnapshot(readTrueExamSnapshot());
            if (expectedId !== null && snapshot.id !== expectedId) throw new Error("Cet ancien document ne peut plus reprendre sa session : elle a été remplacée.");
            if (snapshot.finishReason === "abandoned") throw new Error("Cet examen a été abandonné et ne peut plus être repris.");
            const savedReport = readTrueExamReport(snapshot.id);
            if (savedReport) {
                if (snapshot.status === "finished" && snapshot.finishReason !== savedReport.reason) throw new Error("Le motif de fin sauvegardé est incohérent avec le bilan.");
                showTrueExamReport(savedReport);
                return;
            }
            if (snapshot.version === 2 && !snapshot.exerciseIds) throw new Error("Le bilan de cet examen terminé est introuvable.");
            if (trueExamSession?.id === snapshot.id && !trueExamRecoveryPending) return;
            trueExamRecoveryPending = true;
            stopTrueExamTimer();
            cancelTrueExamSave();
            trueExamSession = null;
            currentTrack = snapshot.track;
            // Set language UI before restoring: this function normally replaces the editor's code.
            trueExamMode = false;
            learningMode = false;
            updateTrackLabel();
            updateTrackDependentUi();
            trueExamMode = true;
            learningMode = false;
            appEl.classList.toggle("true-exam-mode", true);
            appEl.classList.toggle("learning-mode", false);
            const catalog = getTrackExercises();
            const series = snapshot.exerciseIds.map(id => {
                const matches = catalog.filter(ex => exId(ex) === id);
                if (matches.length !== 1 || (snapshot.track === "js" && !jsExercises.length)) {
                    throw new Error("Reprise impossible : un exercice sauvegardé est absent ou ambigu dans le catalogue.");
                }
                return matches[0];
            });
            const reloading = recoveryNavigationType() === "reload" && snapshot.tabId === trueExamTabId;
            const interruptionExpired = snapshot.interruptedAt !== null && !reloading && Date.now() - snapshot.interruptedAt > TRUE_EXAM_RECOVERY_MS;
            const finished = snapshot.status === "finished" || Date.now() >= snapshot.endsAt || interruptionExpired;
            try {
                window.localStorage.setItem(TRUE_EXAM_STORAGE_KEY, JSON.stringify({ ...snapshot, ownerId: trueExamPageId }));
            } catch { trueExamStorageWarning(); }
            trueExamSeries = series;
            trueExamIndex = snapshot.index;
            trueExamState = "running"; // Let selectExercise render only the saved current exercise.
            selectExercise(snapshot.exerciseId);
            codeEditorEl.value = snapshot.code;
            updateHighlight();
            startTrueExamTimer(snapshot.startedAt, snapshot.endsAt, {
                id: snapshot.id, drafts: Object.assign(Object.create(null), snapshot.drafts),
                results: snapshot.results, finishReason: null, finishPending: finished
            });
            if (finished && trueExamState === "running") {
                const reason = snapshot.finishReason || (Date.now() >= snapshot.endsAt ? "time_expired" : "interruption_timeout");
                const completedAt = reason === "time_expired" ? snapshot.endsAt
                    : snapshot.status === "finished" ? Math.min(snapshot.savedAt, snapshot.endsAt)
                        : Math.min(Date.now(), (snapshot.interruptedAt ?? snapshot.savedAt) + TRUE_EXAM_RECOVERY_MS);
                finishTrueExamSession(reason, completedAt, snapshot.status === "finished");
            }
            trueExamRecoveryPending = false;
            trueExamSuspendedSessionId = null;
            renderChips();
            updateModeLabel();
            updateTrueExamControls();
            saveTrueExamSession();
            if (trueExamState === "running") armTrueExamHistoryGuard(trueExamSession.id);
        } catch (error) {
            failTrueExamRecovery(error instanceof SyntaxError
                ? "La sauvegarde de l’examen est invalide : lecture impossible." : error.message);
        }
    })();
    try { await trueExamRestorePromise; } finally { trueExamRestorePromise = null; }
}

async function requestTrueExamStart() {
    if (trueExamStarting || trueExamRecoveryPending || !trueExamMode || trueExamState !== "ready") return;
    trueExamStarting = true;
    try {
        if (!await acquireTrueExamOwnership()) {
            updateTrueExamStatus("Un examen est déjà ouvert dans un autre onglet.");
            return;
        }
        if (!trueExamMode || trueExamState !== "ready") { releaseTrueExamOwnership(); return; }
        let snapshot;
        try {
            snapshot = readTrueExamSnapshot();
            if (snapshot !== null) validateTrueExamSnapshot(snapshot);
        }
        catch {
            failTrueExamRecovery("La sauvegarde de l’examen est invalide : lecture impossible.");
            return;
        }
        if (snapshot && snapshot.status === "running") {
            trueExamRecoveryPending = true;
            await restoreTrueExamSession();
        } else {
            try { window.localStorage.removeItem(TRUE_EXAM_STORAGE_KEY); } catch { trueExamStorageWarning(); }
            startTrueExamSeries();
            if (!trueExamSession) releaseTrueExamOwnership();
        }
    } finally {
        trueExamStarting = false;
    }
}

function initializeTrueExamRecovery() {
    try {
        const snapshot = readTrueExamSnapshot();
        if (snapshot === null) return;
        validateTrueExamSnapshot(snapshot);
        if (snapshot.finishReason === "abandoned") return;
    } catch {
        // Defer invalid snapshot handling until after catalogue loading.
    }
    setAppMode("true-exam");
    trueExamRecoveryPending = true;
    trueExamState = "finished";
    trueExamExpiredEl.textContent = "Restauration de l’examen après chargement des exercices…";
    updateTrueExamControls();
    try {
        const snapshot = readTrueExamSnapshot();
        if (snapshot?.status === "finished" || (snapshot && readTrueExamReport(snapshot.id))) restoreTrueExamSession();
    } catch { /* Validation is displayed by the regular restoration path. */ }
}

codeEditorEl.addEventListener("input", scheduleTrueExamSave);
codeEditorEl.addEventListener("keydown", event => {
    if (event.defaultPrevented) scheduleTrueExamSave(); // Custom indentation/pair edits do not emit input.
});
function finishTrueExamHistoryExit() {
    if (trueExamState !== "running") return;
    abandonTrueExamSession();
    trueExamExpiredEl.textContent = "L’examen a été abandonné en quittant son entrée dans l’historique.";
    updateTrueExamControls();
}

function trueExamHistoryMarker(state = window.history?.state) {
    const marker = state?.[TRUE_EXAM_HISTORY_KEY];
    return marker && typeof marker.guardId === "string" && typeof marker.sessionId === "string" &&
        ["base", "exam"].includes(marker.kind) ? marker : null;
}

function syncTrueExamHistoryGuard() {
    const marker = trueExamHistoryMarker();
    trueExamHistoryGuard = marker?.kind === "exam" ? { ...marker, atExam: true } : null;
}

function armTrueExamHistoryGuard(sessionId) {
    const history = window.history;
    try {
        if (!history?.pushState || !history?.replaceState || !history?.back) throw new Error("History API unavailable");
        const existing = trueExamHistoryMarker();
        const guardId = existing?.guardId || crypto.randomUUID();
        const state = { ...history.state };
        if (existing?.kind !== "exam") {
            history.replaceState({ ...state, [TRUE_EXAM_HISTORY_KEY]: { kind: "base", guardId, sessionId } }, "");
            history.pushState({ ...state, [TRUE_EXAM_HISTORY_KEY]: { kind: "exam", guardId, sessionId } }, "");
        } else if (existing.sessionId !== sessionId) {
            // Reuse the existing pair for a fresh exam; no stacking guards after restarts.
            history.replaceState({ ...state, [TRUE_EXAM_HISTORY_KEY]: { kind: "exam", guardId, sessionId } }, "");
        }
        trueExamHistoryGuard = { kind: "exam", guardId, sessionId, atExam: true };
    } catch {
        trueExamHistoryGuard = null;
        outputEl.textContent = "Protection du bouton Précédent indisponible : l’abandon par historique ne peut pas être garanti dans ce navigateur.";
    }
}

function abandonTrueExamFromHistory(sessionId) {
    if (trueExamSession?.id === sessionId) {
        if (trueExamState === "running") finishTrueExamHistoryExit();
        return;
    }
    // Back can arrive immediately after F5, before asynchronous catalogue/lock loading.
    try {
        const snapshot = readTrueExamSnapshot();
        if (snapshot?.id !== sessionId || snapshot.status !== "running" || snapshot.tabId !== trueExamTabId) return;
        window.localStorage.setItem(TRUE_EXAM_STORAGE_KEY, JSON.stringify({
            version: 2, id: sessionId, status: "finished", finishReason: "abandoned"
        }));
        clearTrueExamMemory();
        trueExamSuspendedSessionId = null;
        releaseTrueExamOwnership();
        trueExamExpiredEl.textContent = "L’examen a été abandonné en quittant son entrée dans l’historique.";
        updateTrueExamControls();
    } catch { trueExamStorageWarning(); }
}

syncTrueExamHistoryGuard();
window.addEventListener("popstate", event => {
    const marker = trueExamHistoryMarker(event.state);
    const guard = trueExamHistoryGuard;
    if (guard?.atExam && marker?.kind === "base" && marker.guardId === guard.guardId) {
        guard.atExam = false; // Consume once before the asynchronous traversal: never a history loop.
        abandonTrueExamFromHistory(guard.sessionId);
        try { window.history.back(); } catch { /* No retry: never trap browser navigation. */ }
        return;
    }
    trueExamHistoryGuard = marker?.kind === "exam" ? { ...marker, atExam: true } : null;
});

// Modern navigation remains supplementary for known backward jumps which skip the guard.
if (window.navigation?.addEventListener) {
    window.navigation.addEventListener("navigate", event => {
        trueExamHistoryExit = null;
        const currentIndex = window.navigation.currentEntry?.index;
        const destinationIndex = event.destination?.index;
        if (trueExamState === "running" && trueExamSession && event.navigationType === "traverse" &&
            Number.isInteger(currentIndex) && Number.isInteger(destinationIndex) &&
            destinationIndex >= 0 && destinationIndex < currentIndex) {
            trueExamHistoryExit = { id: trueExamSession.id, signal: event.signal, fromIndex: currentIndex, toIndex: destinationIndex };
        }
    });
    window.navigation.addEventListener("navigateerror", () => { trueExamHistoryExit = null; });
    window.navigation.addEventListener("currententrychange", event => {
        // A same-document Back has committed; cross-document departures use pagehide below.
        const currentIndex = window.navigation.currentEntry?.index;
        if (trueExamState === "running" && trueExamSession && trueExamHistoryExit?.id === trueExamSession.id &&
            !trueExamHistoryExit?.signal?.aborted && event.navigationType === "traverse" &&
            event.from?.index === trueExamHistoryExit.fromIndex && currentIndex === trueExamHistoryExit.toIndex) {
            finishTrueExamHistoryExit();
        }
    });
}

window.addEventListener("pagehide", () => {
    if (!trueExamSession || !trueExamStorageOwned) return;
    if (trueExamHistoryExit?.id === trueExamSession.id && !trueExamHistoryExit.signal?.aborted) {
        finishTrueExamHistoryExit();
        return;
    }
    // pagehide alone is an interruption, never evidence of voluntary abandonment.
    const sessionId = trueExamSession.id;
    refreshTrueExamTimer();
    saveTrueExamSession(Date.now());
    clearTrueExamMemory(); // Do not leave code in a cached Document or its form controls.
    trueExamSuspendedSessionId = sessionId;
    releaseTrueExamOwnership();
    updateTrueExamControls();
});
window.addEventListener("pageshow", event => {
    if (event.persisted) syncTrueExamHistoryGuard();
    if (event.persisted && trueExamMode && trueExamSuspendedSessionId) {
        trueExamHistoryExit = null;
        trueExamRecoveryPending = true;
        updateTrueExamControls();
        return restoreTrueExamSession(trueExamSuspendedSessionId);
    }
});
window.addEventListener("storage", event => {
    if (event.key === TRUE_EXAM_STORAGE_KEY && trueExamSession && trueExamStorageOwned) ownsTrueExamSnapshot();
});

function stopTrueExamTimer() {
    if (trueExamTimerInterval !== null) clearInterval(trueExamTimerInterval);
    trueExamTimerInterval = null;
}

function formatTrueExamTime(remainingMs) {
    const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
        .map(value => String(value).padStart(2, "0")).join(":");
}

function expireTrueExamSession() {
    if (trueExamState === "running") finishTrueExamSession("time_expired", trueExamSession.endsAt);
}

function refreshTrueExamTimer() {
    const remaining = trueExamSession ? Math.max(0, trueExamSession.endsAt - Date.now()) : TRUE_EXAM_DURATION_MS;
    const display = formatTrueExamTime(remaining);
    if (trueExamTimerEl.textContent !== display) trueExamTimerEl.textContent = display;
    if (trueExamSession && remaining === 0) expireTrueExamSession();
}

// Restoration supplies identity/drafts after rebuilding the original series and editor.
function startTrueExamTimer(startedAt = Date.now(), endsAt = startedAt + TRUE_EXAM_DURATION_MS, restored = {}) {
    stopTrueExamTimer();
    trueExamSession = { startedAt, endsAt, track: currentTrack,
        id: restored.id || crypto.randomUUID(), drafts: restored.drafts || Object.create(null),
        finishReason: restored.finishReason || null, results: restored.results || createTrueExamResults(trueExamSeries.map(exId)) };
    trueExamState = "running";
    trueExamExpiredEl.textContent = "";
    // A terminal restoration is finalized synchronously without starting an interval.
    if (restored.finishPending) return;
    refreshTrueExamTimer();
    if (trueExamState === "running") trueExamTimerInterval = setInterval(refreshTrueExamTimer, 1000);
}

function resetTrueExamTimer() {
    cancelTrueExamSave();
    stopTrueExamTimer();
    trueExamSession = null;
    trueExamExpiredEl.textContent = "";
    refreshTrueExamTimer();
}

function canRunTrueExam() {
    if (!trueExamMode) return true;
    if (trueExamRecoveryPending || !ownsTrueExamSnapshot()) return false;
    refreshTrueExamTimer();
    return trueExamState === "running" && !!trueExamSession;
}

// Visibility changes refresh the clock; they never pause or extend the session.
document.addEventListener("visibilitychange", () => {
    if (trueExamMode && trueExamSession) {
        refreshTrueExamTimer();
        saveTrueExamSession();
    }
});

function updateTrueExamStatus(message) {
    if (!trueExamStatusEl) return;
    trueExamStatusEl.textContent = message || "";
}

function updateTrueExamControls() {
    const running = trueExamMode && trueExamState === "running";
    const preparing = trueExamMode && trueExamState === "ready";
    const showingResults = trueExamMode && trueExamState === "finished" && !!trueExamReport;
    appEl.classList.toggle("show-true-exam-results", showingResults);
    trueExamResultsEl.hidden = !showingResults;
    trueExamFinishBtn.hidden = !running;
    codeEditorEl.disabled = (trueExamMode && !running) || trueExamRecoveryPending;
    trueExamEditorHintEl.hidden = !preparing;
    if (editorWrapperEl) editorWrapperEl.classList.toggle("is-inactive", preparing);
    statementEl.hidden = preparing;
    trueExamExpiredEl.hidden = !trueExamMode || trueExamState !== "finished";
    trueExamProgressEl.hidden = !running;
    trueExamProgressEl.textContent = running
        ? `Exercice ${String(trueExamIndex + 1).padStart(2, "0")} / ${String(trueExamSeries.length).padStart(2, "0")}`
        : "";
    runBtn.disabled = trueExamMode && !running;
    trackSwitchEl.hidden = running;
    trackInputs.forEach(input => { input.disabled = running; });
    trueExamHeaderEl.hidden = !running;
    trueExamHeaderTrackEl.textContent = (trueExamSession?.track || currentTrack).toUpperCase();
    trueExamPreparationEl.hidden = !preparing;
    trueExamPreparationTrackEl.textContent = currentTrack.toUpperCase();
    trueExamStartBtn.disabled = !trueExamMode || trueExamState !== "ready" || !hasTrueExamExercises();
    trueExamNextBtn.hidden = true;
    trueExamRestartBtn.hidden = true;
    if (!trueExamNextBtn || !trueExamRestartBtn) return;
    const hasSeries = trueExamSeries.length > 0;
    trueExamNextBtn.disabled = !trueExamMode || !hasSeries || trueExamIndex >= trueExamSeries.length - 1;
    trueExamRestartBtn.disabled = !trueExamMode;
}

function setTrueExamMode(enabled) {
    if (!!enabled === trueExamMode) return;
    if (!enabled) {
        dismissTrueExamReport();
        abandonTrueExamSession();
    }
    trueExamMode = !!enabled;
    if (appEl) {
        appEl.classList.toggle("true-exam-mode", trueExamMode);
    } else {
        document.body.classList.toggle("true-exam-mode", trueExamMode);
    }

    if (trueExamMode) {
        previousLevelFilter = currentLevelFilter;
        prepareTrueExam();
    } else {
        stopTrueExamSeries();
        currentLevelFilter = previousLevelFilter || "all";
        renderLevelFilters();
        renderChips();
    }

    updateModeLabel();
    updateTrueExamControls();
}

function buildTrueExamSeries() {
    const source = getTrackExercises();
    if (isJsTrack()) {
        const shuffled = [...source].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(10, shuffled.length));
    }
    const series = [];
    for (let level = 1; level <= 10; level++) {
        const candidates = source.filter(ex => ex.level === level);
        if (!candidates.length) continue;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        series.push(pick);
    }
    return series;
}

function hasTrueExamExercises() {
    return exercisesLoaded && (!isJsTrack() || jsExercises.length > 0) && getTrackExercises().length > 0;
}

function prepareTrueExam() {
    dismissTrueExamReport();
    stopTrueExamSeries();
    trueExamState = "ready";
    currentExercise = null;
    examTitleEl.textContent = "Préparation True Exam";
    statementEl.textContent = "";
    updateTrueExamStatus(hasTrueExamExercises() ? "" : "Exercices indisponibles ou en cours de chargement.");
    updateTrueExamControls();
    const panel = trueExamPreparationEl.closest(".left-panel");
    if (panel) panel.scrollTop = 0;
}

function startTrueExamSeries() {
    if (!trueExamMode || trueExamState !== "ready" || trueExamRecoveryPending || !trueExamStorageOwned) return;
    resetTrueExamTimer();
    const available = hasTrueExamExercises();
    trueExamSeries = available ? buildTrueExamSeries() : [];
    trueExamIndex = trueExamSeries.length ? 0 : -1;
    renderChips();

    if (trueExamSeries.length) {
        updateTrueExamStatus(`Série démarrée (${trueExamSeries.length} exos).`);
        trueExamState = "running";
        selectExercise(exId(trueExamSeries[0]));
        startTrueExamTimer();
        saveTrueExamSession();
        if (trueExamSession) armTrueExamHistoryGuard(trueExamSession.id);
    } else {
        updateTrueExamStatus("Aucun exercice disponible pour lancer la série.");
        examTitleEl.textContent = "True Exam";
        statementEl.innerHTML = "Aucun exercice disponible pour la série.";
    }
    updateTrueExamControls();
}

function restartTrueExamSeries() {
    // Reserved for a future relaxed practice mode.
    if (!trueExamMode || trueExamState !== "ready") return;
    startTrueExamSeries();
}

function stopTrueExamSeries() {
    if (trueExamState === "running") trueExamState = "finished";
    resetTrueExamTimer();
    trueExamSeries = [];
    trueExamIndex = -1;
    updateTrueExamStatus(trueExamMode ? "Série arrêtée." : "");
    renderChips();
    updateTrueExamControls();
}

function nextTrueExamExercise() {
    // Strict mode will advance only after validation in a later phase.
    if (trueExamState === "running" || trueExamState === "finished") return;
    if (!trueExamMode || trueExamSeries.length === 0) return;
    if (trueExamIndex < trueExamSeries.length - 1) {
        trueExamIndex += 1;
        selectExercise(exId(trueExamSeries[trueExamIndex]));
    } else {
        updateTrueExamStatus("Série terminée.");
    }
    updateTrueExamControls();
}
function normalizeExerciseId(id) {
    return (id || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function exId(ex) {
    return ex.id || ex.ID;
}
function exTitle(ex) {
    return ex.title || ex.Title || exId(ex);
}
function exStatement(ex) {
    return ex.statement || ex.Statement || "";
}

function getExerciseLevel(id) {
    const key = normalizeExerciseId(id);
    return LEVEL_MAP[key] || null;
}

function getFilteredExercises() {
    const source = getTrackExercises();
    if (isJsTrack()) return source;
    if (currentLevelFilter === "all") return source;
    return source.filter(ex => ex.level === Number(currentLevelFilter));
}

function getActiveExercises() {
    if (trueExamMode && trueExamSeries.length) return trueExamSeries;
    return getFilteredExercises();
}

function setActiveExerciseChip(id) {
    document.querySelectorAll(".exercise-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.id === id);
    });
}

function updateExerciseHeader(ex) {
    const title = exTitle(ex);
    examTitleEl.textContent = title;
}
const markedLib = typeof window !== "undefined" ? window.marked : undefined;

if (markedLib) {
    markedLib.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });
}

function fallbackMarkdownToHtml(md) {
    if (!md) return '';

    if (/<[a-z][\s\S]*>/i.test(md)) return md.trim();

    const codeBlocks = [];
    let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
        const id = `@@CODE${codeBlocks.length}@@`;
        codeBlocks.push({ lang: lang || '', code });
        return id;
    });

    const lines = processed.split(/\r?\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
        let line = lines[i];
        if (line.trim() === '') {
            i++;
            continue;
        }

        const h = line.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            const level = h[1].length;
            out.push(`<h${level}>${escapeHtml(h[2].trim())}</h${level}>`);
            i++;
            continue;
        }

        if (line.trim().match(/^[-*+]\s+/)) {
            const items = [];
            while (i < lines.length && lines[i].trim().match(/^[-*+]\s+/)) {
                items.push(escapeHtml(lines[i].trim().replace(/^[-*+]\s+/, '')));
                i++;
            }
            out.push('<ul>' + items.map(it => `<li>${it}</li>`).join('') + '</ul>');
            continue;
        }

        const para = [line];
        i++;
        while (i < lines.length && lines[i].trim() !== '') {
            para.push(lines[i]);
            i++;
        }
        let paragraph = para.join(' ');
        paragraph = paragraph.replace(/`([^`]+)`/g, (m, c) => `<code>${escapeHtml(c)}</code>`);
        out.push('<p>' + escapeHtml(paragraph).replace(/&lt;code&gt;(.*?)&lt;\/code&gt;/g, '<code>$1</code>') + '</p>');
    }

    let html = out.join('\n');

    html = html.replace(/@@CODE(\d+)@@/g, (m, idx) => {
        const cb = codeBlocks[Number(idx)];
        if (!cb) return '';
        const codeEsc = escapeHtml(cb.code);
        return `<pre><code${cb.lang ? ` data-lang="${cb.lang}"` : ''}>${codeEsc}</code></pre>`;
    });

    return html;
}

function markdownToHtml(md) {
    if (!md) return '';
    if (markedLib && typeof markedLib.parse === 'function') {
        return markedLib.parse(md);
    }
    return fallbackMarkdownToHtml(md);
}

function highlightMarkdownCode(containerEl) {
    if (!containerEl) return;
    const blocks = containerEl.querySelectorAll('pre code');
    blocks.forEach((codeEl) => {
        const raw = codeEl.textContent || '';
        const html = highlightGo(raw);
        codeEl.innerHTML = html + (raw.endsWith('\n') ? '\n' : '');
    });
}

async function fetchTextResource(path) {
    const url = buildLearningUrl(path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

function buildLearningUrl(path) {
    const normalized = (path || "").replace(/^\//, "");
    const encodedPath = encodeURI(normalized).replace(/#/g, "%23");
    try {
        return new URL("/" + encodedPath, window.location.origin).toString();
    } catch {
        return "/" + encodedPath;
    }
}

function normalizeLesson(raw, idx) {
    if (!raw || typeof raw !== "object") return null;
    const id = raw.id || raw.ID || raw.slug || raw.name || `lesson-${String(idx + 1).padStart(2, "0")}`;
    const title = raw.title || raw.Title || raw.name || raw.id || `Leçon ${idx + 1}`;
    const path = raw.path || raw.url || raw.file || raw.href;
    if (!path) return null;
    const slug = raw.slug || slugify(title || id);
    return { id, title, path, slug };
}

function renderLearningContent(md) {
    if (!learningContentEl) return;
    const html = markdownToHtml(md || defaultLessonMsg);
    learningContentEl.innerHTML = html || defaultLessonMsg;
    highlightMarkdownCode(learningContentEl);
}

function renderLearningLessons() {
    if (!learningLessonsEl) return;
    learningLessonsEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "header";
    const title = document.createElement("div");
    title.textContent = "Leçons";
    const count = document.createElement("div");
    count.textContent = learningLessons.length > 0 ? `${learningLessons.length}` : "0";
    header.appendChild(title);
    header.appendChild(count);
    learningLessonsEl.appendChild(header);

    if (!learningLessons.length) {
        const empty = document.createElement("div");
        empty.className = "learning-empty";
        empty.innerHTML = `Dépose tes fichiers Markdown dans <code>learning-content/</code> puis référence-les dans <code>manifest.json</code> (clé <code>lessons</code>).`;
        learningLessonsEl.appendChild(empty);
        return;
    }

    learningLessons.forEach((lesson, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lesson-item";
        if (lesson.id === learningCurrentLessonId) {
            btn.classList.add("active");
        }
        const labelId = lesson.id || idx + 1;
        btn.textContent = `${labelId} - ${lesson.title}`;
        btn.addEventListener("click", () => {
            selectLearningLesson(lesson.id);
        });
        learningLessonsEl.appendChild(btn);
    });
}

function renderJsLearningLessons() {
    if (!learningLessonsEl) return;
    learningLessonsEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "header";
    const title = document.createElement("div");
    title.textContent = "Leçons JS";
    const count = document.createElement("div");
    count.textContent = `${jsLearningLessons.length}`;
    header.appendChild(title);
    header.appendChild(count);
    learningLessonsEl.appendChild(header);

    jsLearningLessons.forEach((lesson) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lesson-item";
        if (lesson.id === jsLearningCurrentLessonId) {
            btn.classList.add("active");
        }
        btn.textContent = `${lesson.id} - ${lesson.title}`;
        btn.addEventListener("click", () => {
            selectJsLearningLesson(lesson.id);
        });
        learningLessonsEl.appendChild(btn);
    });
}

function selectJsLearningLesson(lessonId) {
    const lesson = jsLearningLessons.find((l) => l.id === lessonId) || jsLearningLessons[0];
    if (!lesson) return;
    jsLearningCurrentLessonId = lesson.id;
    renderJsLearningLessons();
    renderLearningContent(lesson.content);
}

async function loadLearningManifest() {
    try {
        const res = await fetch("/learning-content/manifest.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        learningManifest = data || {};
        const lessons = Array.isArray(learningManifest.lessons) ? learningManifest.lessons : [];
        learningLessons = lessons.map((l, i) => normalizeLesson(l, i)).filter(Boolean);
    } catch (e) {
        learningManifest = null;
        learningLessons = [];
        console.warn("Impossible de charger le manifest learning:", e.message || e);
    }
}

async function loadLearningData() {
    if (learningLoaded) return;
    learningLoaded = true;
    await loadLearningManifest();
}

async function selectLearningLesson(lessonId) {
    let lesson = learningLessons.find(l => l.id === lessonId);
    if (!lesson) {
        const slugId = slugify(lessonId || "");
        lesson = learningLessons.find(l => l.slug === slugId);
    }
    if (!lesson) return;
    learningCurrentLessonId = lesson.id;
    renderLearningLessons();
    if (learningContentEl) {
        learningContentEl.textContent = "Chargement de la leçon...";
    }
    try {
        const cached = learningLessonCache[lesson.id];
        const md = cached || await fetchTextResource("/" + lesson.path.replace(/^\//, ""));
        learningLessonCache[lesson.id] = md;
        renderLearningContent(md);
    } catch (e) {
        renderLearningContent(`Impossible de charger la leçon ${lesson.id} (${lesson.path}) : ${e.message}`);
    }
}

function normalizeLessonPath(p) {
    return decodeURIComponent((p || "").replace(/^\/+/, "").replace(/\\/g, "/"));
}

function findLessonByHref(href) {
    if (!href) return null;
    let url;
    try {
        url = new URL(href, window.location.href);
    } catch {
        return null;
    }
    // Anchor-only links like #structure-dun-fichier-go
    if (href.startsWith("#")) {
        const frag = href.replace(/^#/, "");
        const targetSlug = slugify(decodeURIComponent(frag));
        return learningLessons.find((lesson) => lesson.slug === targetSlug || slugify(lesson.title) === targetSlug || slugify(lesson.id) === targetSlug);
    }

    const pathFromUrl = normalizeLessonPath(url.pathname);
    const filename = pathFromUrl.split("/").pop();
    return learningLessons.find((lesson) => {
        const lp = normalizeLessonPath(lesson.path);
        const lFile = lp.split("/").pop();
        return lp === pathFromUrl || lFile === filename || lesson.id === href;
    });
}

function setLearningMode(enabled) {
    learningMode = !!enabled;
    if (appEl) {
        appEl.classList.toggle("learning-mode", learningMode);
    } else {
        document.body.classList.toggle("learning-mode", learningMode);
    }
    updateModeLabel();
    if (learningMode) {
        if (isJsTrack()) {
            const target = jsLearningCurrentLessonId || (jsLearningLessons[0] && jsLearningLessons[0].id);
            renderJsLearningLessons();
            if (target) {
                selectJsLearningLesson(target);
            } else {
                renderLearningContent("# Learning JS\n\nAucune leçon JS disponible.");
            }
            return;
        }
        if (isRustTrack()) {
            renderLearningLessons();
            renderLearningContent("# Apprentissage Rust\n\nLe parcours Rust est disponible en mode Examen et Vrai examen, avec les énoncés et images officielles Zone01.");
            return;
        }
        if (isJavaTrack()) {
            renderLearningLessons();
            renderLearningContent("# Apprentissage Java\n\nLe parcours Java est disponible en mode Examen et Vrai examen, avec les énoncés et images officielles Zone01.");
            return;
        }
        loadLearningData().then(() => {
            if (!learningLessons.length) {
                renderLearningLessons();
                renderLearningContent(learningSource || defaultLearningMd);
                return;
            }
            const hasCurrent = learningLessons.some((lesson) => lesson.id === learningCurrentLessonId);
            const targetId = hasCurrent ? learningCurrentLessonId : learningLessons[0].id;
            selectLearningLesson(targetId);
        });
    } else {
        renderLearningContent(defaultLessonMsg);
    }
}

async function loadExercises() {
    try {
        const [goRes, jsRes, rustRes, javaRes] = await Promise.all([
            fetch("/api/exercises"),
            fetch("/api/exercises?track=js"),
            fetch("/api/exercises?track=rust"),
            fetch("/api/exercises?track=java")
        ]);
        if (!goRes.ok) {
            outputEl.textContent = "Erreur chargement exercices Go: HTTP " + goRes.status;
            if (trueExamRecoveryPending) failTrueExamRecovery("Reprise impossible : chargement du catalogue interrompu. Recharge la page pour réessayer.");
            return;
        }
        exercises = await goRes.json();
        exercises.forEach(ex => {
            ex.level = getExerciseLevel(exId(ex));
        });
        if (jsRes.ok) {
            const incomingJs = await jsRes.json();
            jsExercises = incomingJs.map((ex, idx) => ({
                ...ex,
                level: Number(ex.level) || ((idx % 10) + 1)
            }));
        } else {
            jsExercises = [];
            console.warn("Chargement des exercices JS impossible: HTTP", jsRes.status);
        }
        if (rustRes.ok) {
            const incomingRust = await rustRes.json();
            rustExercises = incomingRust.map((ex, idx) => ({ ...ex, level: Number(ex.level) || ((idx % 10) + 1) }));
        } else {
            rustExercises = [];
            console.warn("Chargement des exercices Rust impossible: HTTP", rustRes.status);
        }
        if (javaRes.ok) {
            const incomingJava = await javaRes.json();
            javaExercises = incomingJava.map((ex, idx) => ({ ...ex, level: Number(ex.level) || ((idx % 10) + 1) }));
        } else {
            javaExercises = [];
            console.warn("Chargement des exercices Java impossible: HTTP", javaRes.status);
        }
        exercisesLoaded = true;
        if (trueExamRecoveryPending) {
            await restoreTrueExamSession();
            return;
        }
        if (trueExamMode) {
            if (trueExamState === "ready") prepareTrueExam();
            return;
        }
        renderLevelFilters();
        renderChips();
        updateTrueExamControls();
        const source = getTrackExercises();
        if (source.length > 0 && !(trueExamMode && trueExamSeries.length === 0)) {
            selectExercise(exId(source[0]));
        }
    } catch (e) {
        outputEl.textContent = "Erreur chargement exercices: " + e.message;
        if (trueExamRecoveryPending) failTrueExamRecovery("Reprise impossible : catalogue indisponible. Recharge la page pour réessayer.");
    }
}

function renderLevelFilters() {
    if (!levelFiltersEl) return;
    levelFiltersEl.innerHTML = "";
    const filters = [
        { id: "all", label: "Tous" },
        ...Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), label: `N${i + 1}` }))
    ];
    filters.forEach((f) => {
        const chip = document.createElement("div");
        chip.className = "chip filter-chip" + (currentLevelFilter === f.id ? " active" : "");
        chip.dataset.filter = f.id;
        chip.textContent = f.label;
        chip.onclick = () => applyLevelFilter(f.id);
        levelFiltersEl.appendChild(chip);
    });
}

function applyLevelFilter(filterId) {
    if (trueExamMode) return;
    currentLevelFilter = filterId;
    renderLevelFilters();
    renderChips();

    const filtered = getFilteredExercises();
    if (!filtered.length) {
        currentExercise = null;
        examTitleEl.textContent = "Aucun exercice pour ce niveau";
        statementEl.innerHTML = "Aucun exercice disponible pour ce niveau.";
        outputEl.textContent = "";
        return;
    }

    if (currentExercise && filtered.some(ex => exId(ex) === exId(currentExercise))) {
        setActiveExerciseChip(exId(currentExercise));
        updateExerciseHeader(currentExercise);
        return;
    }

    selectExercise(exId(filtered[0]));
}

function renderChips() {
    chipsContainer.innerHTML = "";
    const list = getActiveExercises();
    if (trueExamMode && trueExamSeries.length === 0) {
        const empty = document.createElement("div");
        empty.className = "chips-empty";
        empty.textContent = "Lance la série True Exam.";
        chipsContainer.appendChild(empty);
        return;
    }
    if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "chips-empty";
        empty.textContent = "Aucun exercice pour ce niveau.";
        chipsContainer.appendChild(empty);
        return;
    }
    list.forEach((ex, i) => {
        const chip = document.createElement("div");
        chip.className = "chip exercise-chip";
        chip.dataset.id = exId(ex);
        chip.textContent = exTitle(ex);
        chip.onclick = () => selectExercise(exId(ex));
        chipsContainer.appendChild(chip);
    });
}

function selectExercise(id) {
    if (trueExamMode && (trueExamState !== "running" || exId(trueExamSeries[trueExamIndex] || {}) !== id)) return;
    const ex = getTrackExercises().find(e => exId(e) === id);
    if (!ex) return;
    if (trueExamMode) rememberTrueExamCode();
    currentExercise = ex;
    if (trueExamMode && trueExamSeries.length) {
        const idx = trueExamSeries.findIndex(e => exId(e) === id);
        if (idx >= 0) {
            trueExamIndex = idx;
        }
        updateTrueExamStatus(`Exo ${trueExamIndex + 1}/${trueExamSeries.length}`);
        updateTrueExamControls();
    }

    setActiveExerciseChip(id);
    updateExerciseHeader(ex);
    const rendered = markdownToHtml(exStatement(ex));
    statementEl.innerHTML = rendered || "Contenu Markdown indisponible pour cet exercice.";
    highlightMarkdownCode(statementEl);
    codeEditorEl.value = trueExamMode && trueExamSession ? (trueExamSession.drafts[id] || "") : "";
    updateHighlight();
    outputEl.textContent = "";
    if (trueExamMode) saveTrueExamSession();
}

async function runCode() {
    if (!canRunTrueExam()) return;
    saveTrueExamSession();
    const session = trueExamSession;
    // Ignore results/errors belonging to an expired, abandoned or restarted exam.
    const acceptsResult = () => session === trueExamSession && canRunTrueExam();
    if (!currentExercise) {
        outputEl.textContent = "Sélectionne un exercice.";
        return;
    }

    const code = codeEditorEl.value;
    const exerciseId = exId(currentExercise);
    outputEl.textContent = "Running tests...";

    try {
        const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                exerciseId,
                code
            })
        });

        const raw = await res.text();
        if (!acceptsResult()) return;

        // Protection : backend mal formé ou planté
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            outputEl.textContent = "Réponse invalide du backend :\n" + raw;
            return;
        }

        if (trueExamMode && (!res.ok || !data || typeof data.success !== "boolean")) {
            outputEl.textContent = "Évaluation non comptabilisée : réponse invalide ou erreur HTTP.";
            return;
        }
        if (trueExamMode) recordTrueExamEvaluation(session, exerciseId, data.success);
        if (trueExamMode && trueExamState !== "running") return;
        const ok = !!data.success;
        const out = (data.output || "").toString();

        if (ok) {
            const successMsg = "OK: tous les tests sont validés.";
            const normalized = out.trim();
            if (normalized === "" || normalized === successMsg) {
                outputEl.textContent = successMsg + "\n\nRésultat du test: aucune sortie (runner silencieux).";
            } else if (normalized.startsWith(successMsg)) {
                outputEl.textContent = out;
            } else {
                outputEl.textContent = successMsg + "\n\nRésultat du test:\n" + out;
            }
        } else {
            outputEl.textContent = out.trim() !== "" ? out : "Erreur inconnue (aucune sortie retournée).";
        }
    } catch (e) {
        if (!acceptsResult()) return;
        outputEl.textContent = "Erreur réseau ou JS : " + e.message;
    }
}

function clearConsole() {
    outputEl.textContent = "";
}

trueExamFinishBtn.addEventListener("click", submitTrueExamEarly);
document.getElementById("true-exam-new").addEventListener("click", newTrueExamFromReport);
document.getElementById("true-exam-quit").addEventListener("click", () => setAppMode("exam"));
trueExamStartBtn.addEventListener("click", requestTrueExamStart);
runBtn.addEventListener("click", runCode);
clearBtn.addEventListener("click", clearConsole);
if (modeInputs.length) {
    modeInputs.forEach((input) => {
        input.addEventListener("change", (e) => {
            const target = e.currentTarget;
            if (!target.checked) return;
            setAppMode(target.value);
        });
    });
}
if (trackInputs.length) {
    trackInputs.forEach((input) => {
        input.addEventListener("change", (e) => {
            const target = e.currentTarget;
            if (!target.checked) return;
            setTrackMode(target.value);
        });
    });
}
if (trueExamNextBtn) {
    trueExamNextBtn.addEventListener("click", nextTrueExamExercise);
}
if (trueExamRestartBtn) {
    trueExamRestartBtn.addEventListener("click", restartTrueExamSeries);
}
if (learningContentEl) {
    learningContentEl.addEventListener("click", (e) => {
        const anchor = e.target.closest("a");
        if (!anchor) return;
        const lesson = findLessonByHref(anchor.getAttribute("href"));
        if (lesson) {
            e.preventDefault();
            selectLearningLesson(lesson.id);
        }
    });
}

// --- Gestion du redimensionnement ---
let isResizing = false;
let currentHandle = null;
let initialSize = 0;
let initialPosition = 0;
const leftPanelEl = document.querySelector('.left-panel');
const editorContainerEl = document.querySelector('.editor-container');
const rightPanelEl = document.querySelector('.right-panel');
const layoutEl = document.querySelector('.layout');
const rootStyle = document.documentElement.style;
const handleWidth = 4;
const handleHeight = 4;
const minLeftWidth = 200;
const minRightWidth = 220; // panel + handle
const minEditorHeight = 140;
const minConsoleHeight = 120;

function applyLeftPanelWidth(px) {
    const safe = Math.max(minLeftWidth, px);
    rootStyle.setProperty('--left-panel-width', `${safe}px`);
}

function applyEditorHeight(px) {
    const safe = Math.max(minEditorHeight, px);
    rootStyle.setProperty('--editor-height', `${safe}px`);
    if (editorContainerEl) {
        editorContainerEl.style.height = `${safe}px`;
        editorContainerEl.style.flexBasis = `${safe}px`;
    }
}

if (layoutEl && leftPanelEl) {
    const layoutWidth = layoutEl.getBoundingClientRect().width || window.innerWidth;
    const initial = leftPanelEl.getBoundingClientRect().width || layoutWidth * 0.5;
    applyLeftPanelWidth(initial);
}
if (rightPanelEl && editorContainerEl) {
    const initialHeight = editorContainerEl.getBoundingClientRect().height || (rightPanelEl.getBoundingClientRect().height * 0.6);
    applyEditorHeight(initialHeight);
}

// Initialiser les gestionnaires de redimensionnement
document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', startResize);
});

function startResize(e) {
    isResizing = true;
    currentHandle = e.target;
    currentHandle.classList.add('active');

    // Mesures initiales
    if (currentHandle.classList.contains('horizontal')) {
        initialSize = editorContainerEl ? editorContainerEl.getBoundingClientRect().height : 0;
        initialPosition = e.clientY;
    } else {
        initialSize = leftPanelEl ? leftPanelEl.getBoundingClientRect().width : 0;
        initialPosition = e.clientX;
    }

    // Ajout temporaire des écouteurs
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
}

function resize(e) {
    if (!isResizing) return;

    if (currentHandle && currentHandle.classList.contains('horizontal')) {
        if (!rightPanelEl || !editorContainerEl) return;
        const delta = e.clientY - initialPosition;
        const panelHeight = rightPanelEl.getBoundingClientRect().height || window.innerHeight;
        const maxHeight = Math.max(minEditorHeight, panelHeight - minConsoleHeight - handleHeight);
        const newHeight = Math.max(minEditorHeight, Math.min(initialSize + delta, maxHeight));
        applyEditorHeight(newHeight);
        return;
    }

    // Redimensionnement horizontal (énoncé vs éditeur)
    if (!leftPanelEl || !rightPanelEl) return;
    const delta = e.clientX - initialPosition;
    const layoutWidth = layoutEl ? layoutEl.getBoundingClientRect().width : window.innerWidth;
    const maxWidth = Math.max(minLeftWidth, layoutWidth - minRightWidth - handleWidth);
    const newWidth = Math.max(minLeftWidth, Math.min(initialSize + delta, maxWidth));
    applyLeftPanelWidth(newWidth);
}

function stopResize() {
    isResizing = false;
    if (currentHandle) {
        currentHandle.classList.remove('active');
        currentHandle = null;
    }
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
}

// --- Redimensionnement Learning (liste vs contenu) ---
let isLearningResizing = false;
let learningHandle = null;
let learningInitialSize = 0;
let learningInitialPosition = 0;

const learningLayoutEl = document.querySelector('.learning-layout');
const learningSidebarEl = document.querySelector('.learning-sidebar');

document.querySelectorAll('.learning-resize-handle.vertical').forEach(handle => {
    handle.addEventListener('mousedown', startLearningResize);
});

function startLearningResize(e) {
    isLearningResizing = true;
    learningHandle = e.target;
    learningHandle.classList.add('active');

    learningInitialSize = learningSidebarEl ? learningSidebarEl.offsetWidth : 0;
    learningInitialPosition = e.clientX;

    document.addEventListener('mousemove', resizeLearning);
    document.addEventListener('mouseup', stopLearningResize);
}

function resizeLearning(e) {
    if (!isLearningResizing) return;
    if (!learningLayoutEl || !learningSidebarEl) return;

    const delta = e.clientX - learningInitialPosition;
    const maxWidth = learningLayoutEl.offsetWidth - 200;
    const newWidth = Math.max(200, Math.min(learningInitialSize + delta, maxWidth));
    learningSidebarEl.style.width = newWidth + 'px';
}

function stopLearningResize() {
    isLearningResizing = false;
    if (learningHandle) {
        learningHandle.classList.remove('active');
        learningHandle = null;
    }
    document.removeEventListener('mousemove', resizeLearning);
    document.removeEventListener('mouseup', stopLearningResize);
}

const initialLearningMode =
    (modeLearningEl && modeLearningEl.checked) ||
    (appEl && appEl.classList.contains("learning-mode")) ||
    document.body.classList.contains("learning-mode");
const initialTrueExamMode =
    (modeTrueExamEl && modeTrueExamEl.checked) ||
    (appEl && appEl.classList.contains("true-exam-mode")) ||
    document.body.classList.contains("true-exam-mode");
if (initialLearningMode) {
    setAppMode("learning");
} else if (initialTrueExamMode) {
    setAppMode("true-exam");
} else {
    setAppMode((modeExamEl && modeExamEl.checked) ? "exam" : "exam");
}
updateTrueExamControls();

let initialTrack = "go";
try {
    const storedTrack = window.localStorage.getItem("z02intra-track-mode");
    if (storedTrack === "js" || storedTrack === "go" || storedTrack === "rust" || storedTrack === "java") {
        initialTrack = storedTrack;
    } else if (trackInputs.length) {
        const checked = trackInputs.find((input) => input.checked);
        initialTrack = checked ? checked.value : "go";
    }
} catch {
    if (trackInputs.length) {
        const checked = trackInputs.find((input) => input.checked);
        initialTrack = checked ? checked.value : "go";
    }
}
setTrackMode(initialTrack);

initializeTrueExamRecovery();
loadExercises();
