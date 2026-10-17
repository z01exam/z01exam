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
        startTrueExamSeries();
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

function updateTrueExamStatus(message) {
    if (!trueExamStatusEl) return;
    trueExamStatusEl.textContent = message || "";
}

function updateTrueExamControls() {
    if (!trueExamNextBtn || !trueExamRestartBtn) return;
    const hasSeries = trueExamSeries.length > 0;
    trueExamNextBtn.disabled = !trueExamMode || !hasSeries || trueExamIndex >= trueExamSeries.length - 1;
    trueExamRestartBtn.disabled = !trueExamMode;
}

function setTrueExamMode(enabled) {
    trueExamMode = !!enabled;
    if (appEl) {
        appEl.classList.toggle("true-exam-mode", trueExamMode);
    } else {
        document.body.classList.toggle("true-exam-mode", trueExamMode);
    }

    if (trueExamMode) {
        previousLevelFilter = currentLevelFilter;
        startTrueExamSeries();
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
    // Les examens de l'ancien cursus (archives) restent consultables mais ne
    // sont jamais tirés dans un examen.
    const source = getTrackExercises().filter(ex => !ex.archive);
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

function startTrueExamSeries() {
    if (!trueExamMode) return;
    trueExamSeries = buildTrueExamSeries();
    trueExamIndex = trueExamSeries.length ? 0 : -1;
    renderChips();

    if (trueExamSeries.length) {
        updateTrueExamStatus(`Série démarrée (${trueExamSeries.length} exos).`);
        selectExercise(exId(trueExamSeries[0]));
    } else {
        updateTrueExamStatus("Aucun exercice disponible pour lancer la série.");
        examTitleEl.textContent = "True Exam";
        statementEl.innerHTML = "Aucun exercice disponible pour la série.";
    }
    updateTrueExamControls();
}

function restartTrueExamSeries() {
    if (!trueExamMode) return;
    startTrueExamSeries();
}

function stopTrueExamSeries() {
    trueExamSeries = [];
    trueExamIndex = -1;
    updateTrueExamStatus(trueExamMode ? "Série arrêtée." : "");
    renderChips();
    updateTrueExamControls();
}

function nextTrueExamExercise() {
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
        renderLevelFilters();
        renderChips();
        updateTrueExamControls();
        const source = getTrackExercises();
        if (source.length > 0 && !(trueExamMode && trueExamSeries.length === 0)) {
            selectExercise(exId(source[0]));
        }
    } catch (e) {
        outputEl.textContent = "Erreur chargement exercices: " + e.message;
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
    const ex = getTrackExercises().find(e => exId(e) === id);
    if (!ex) return;
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
    codeEditorEl.value = "";
    updateHighlight();
    outputEl.textContent = "";
}

async function runCode() {
    if (!currentExercise) {
        outputEl.textContent = "Sélectionne un exercice.";
        return;
    }

    const code = codeEditorEl.value;
    outputEl.textContent = "Running tests...";

    try {
        const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                exerciseId: exId(currentExercise),
                code
            })
        });

        const raw = await res.text();

        // Protection : backend mal formé ou planté
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            outputEl.textContent = "Réponse invalide du backend :\n" + raw;
            return;
        }

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
        outputEl.textContent = "Erreur réseau ou JS : " + e.message;
    }
}

function clearConsole() {
    outputEl.textContent = "";
}

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
loadExercises();

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
