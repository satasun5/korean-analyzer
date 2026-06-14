import { analyzePassage, generateQuestions, generateMultipleChoiceQuestions, generateOxShortQuestions, explainSelection, askAboutQuestion, cleanupPassageWithAi, gradeShortAnswer, gradeShortAnswersBatch, askAboutMemo, askChatBots } from "./ai.js";
import { createDemoAnalysis, createDemoQuestions, SAMPLE_PASSAGE } from "./sample.js";
import { loadRecords, saveRecord, deleteRecord, loadSettings, saveSettings } from "./storage.js";

const app = document.querySelector("#app");
const SESSION_API_KEY = "korean_ai_reader_openai_api_key";
const HIGHLIGHT_LABELS = {
  claim: "핵심 주장",
  evidence: "근거",
  contrast: "비교·대조",
  definition: "개념 정의",
  example: "예시",
  warning: "주의·반론",
  support: "부연·균형"
};

const EXPORT_TYPE_LABELS = {
  pdf: "PDF",
  markdown: "Markdown",
  text: "TXT"
};

const EXPORT_OPTION_LABELS = {
  passage: "본문",
  passageHighlights: "본문 형광펜·주석",
  summary: "요약",
  structure: "구조",
  concepts: "개념",
  questions: "문제",
  includeSolutions: "해설 포함",
  notes: "메모",
  comments: "AI 댓글"
};

function createDefaultExportOptions() {
  return {
    passage: true,
    passageHighlights: true,
    summary: true,
    structure: true,
    concepts: true,
    questions: true,
    includeSolutions: true,
    notes: true,
    comments: true
  };
}

const MODEL_PRESETS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", tag: "저비용 기본", input: "가격표 확인", output: "가격표 확인", reasoning: false, note: "현재 입력창 기본값입니다. 계정에서 사용 가능해야 합니다." },
  { id: "gpt-5.4", label: "GPT-5.4", tag: "균형형", input: "$2.50 / 1M", output: "$15.00 / 1M", reasoning: true, note: "비용과 품질 균형. 공식 비교표 기준." },
  { id: "gpt-5.5", label: "GPT-5.5", tag: "고품질 추론", input: "$5.00 / 1M", output: "$30.00 / 1M", reasoning: true, note: "복잡한 지문 분석/출제에 적합. 비용 증가 주의." },
  { id: "gpt-5.5-pro", label: "GPT-5.5 Pro", tag: "최고가 전문", input: "$30.00 / 1M", output: "$180.00 / 1M", reasoning: true, note: "매우 비쌉니다. 꼭 필요한 경우만 사용하세요." },
  { id: "custom", label: "직접 입력", tag: "사용자 지정", input: "-", output: "-", reasoning: false, note: "계정에서 접근 가능한 모델명을 직접 입력합니다." }
];

const OCR_GUIDE = "OCR 지문은 문단 사이에 빈 줄 한 줄을 넣어 주세요. 문단 내부의 강제 줄바꿈은 [OCR 정리]로 한 문단 안에서 이어 붙일 수 있습니다.";

const CHAT_PROFILE_COUNT = 6;
const CHAT_PROFILE_BASE = "assets/chat-profiles/profile";
const CHAT_PROFILE_EXT = "webp";


const QUESTION_AMOUNT_PRESETS = {
  small: { label: "적음", multipleChoice: 4, ox: 5, shortAnswer: 3 },
  medium: { label: "보통", multipleChoice: 5, ox: 10, shortAnswer: 5 },
  large: { label: "많음", multipleChoice: 8, ox: 15, shortAnswer: 7 }
};
const QUESTION_DIFFICULTY_LABELS = { low: "하", medium: "중", high: "상" };
const QUESTION_LENGTH_LABELS = { 1: "짧게", 2: "보통", 3: "길게" };

function createDefaultQuestionSettings() {
  return {
    difficulty: "medium",
    amount: "medium",
    singlePass: false,
    advancedOpen: false,
    counts: { multipleChoice: 5, ox: 10, shortAnswer: 5 },
    lengths: { multipleChoice: 2, ox: 2, shortAnswer: 2 },
    typeDifficulties: { multipleChoice: "medium", ox: "medium", shortAnswer: "medium" }
  };
}

function mergeQuestionSettings(saved = {}) {
  const base = createDefaultQuestionSettings();
  const merged = {
    ...base,
    ...(saved || {}),
    counts: { ...base.counts, ...(saved?.counts || {}) },
    lengths: { ...base.lengths, ...(saved?.lengths || {}) },
    typeDifficulties: { ...base.typeDifficulties, ...(saved?.typeDifficulties || {}) }
  };
  return normalizeQuestionSettings(merged);
}


const state = {
  started: false,
  theme: loadSettings().theme || "light",
  tab: "summary",
  questionTab: "mc",
  questionSettings: mergeQuestionSettings(loadSettings().questionSettings),
  readerAskCollapsed: false,
  passage: "",
  analysis: null,
  questions: null,
  notes: [],
  selectedText: "",
  detail: null,
  filters: Object.fromEntries(Object.keys(HIGHLIGHT_LABELS).map((key) => [key, true])),
  apiKey: safeSessionGet(SESSION_API_KEY),
  model: loadSettings().model || "gpt-4.1-mini",
  reasoningModel: loadSettings().reasoningModel || "gpt-5.5",
  gradingModel: loadSettings().gradingModel || "gpt-4.1-mini",
  useReasoning: loadSettings().useReasoning || false,
  reasoningEffort: loadSettings().reasoningEffort || "medium",
  demoMode: loadSettings().demoMode ?? true,
  loading: null,
  loadingProgress: 0,
  questionPhase: "",
  records: loadRecords(),
  currentRecordId: null,
  mindPositions: {},
  mindPan: { x: 0, y: 0 },
  mindZoom: 1,
  sideMenu: false,
  infoOpen: false,
  modelPickerTarget: null,
  sampleActive: false,
  userPassageSnapshot: "",
  userWorkspaceSnapshot: null,
  toasts: [],
  logs: [],
  logOpen: false,
  noteLoading: false,
  memoAskInput: "",
  selectedMemoInput: "",
  memoAskLoading: false,
  memoFollowInputs: {},
  memoFollowLoading: null,
  flash: null,
  userAnswers: { mc: {}, ox: {}, short: {} },
  revealAnswers: { mc: {}, ox: {}, short: {} },
  shortGrades: {},
  shortGradeLoading: {},
  qnaInputs: {},
  qnaMessages: {},
  qnaLoading: null,
  shortGradeConfirm: {},
  qnaOpen: {},
  // 실행 중인 비동기 작업을 추적하여 버튼 연타와 중복 API 호출을 방지합니다.
  inFlight: {},
  // AI 댓글 탭 상태. 일반 메모/문제 Q&A와 분리해 충돌을 줄입니다.
  botChatInput: "",
  botChatThreads: [],
  botChatLoading: false,
  botReplyInputs: {},
  botReplyOpen: {},
  botReplyLoading: null,
  exportOpen: false,
  exportType: "pdf",
  exportOptions: createDefaultExportOptions()
};

document.documentElement.dataset.theme = state.theme;

function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeSessionSet(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // 일부 브라우저/보안 설정에서 sessionStorage가 막힐 수 있습니다.
  }
}

function normalizeApiKey(value = "") {
  return String(value).replace(/[\s​-‍﻿]/g, "").trim();
}

function getMaskedKeyLabel() {
  const key = normalizeApiKey(state.apiKey || safeSessionGet(SESSION_API_KEY));
  if (!key) return "API 키 미인식";
  const head = key.slice(0, 7);
  const tail = key.slice(-4);
  return `${head}…${tail} 인식됨`;
}

function syncApiKeyFromInput({ showNotice = false, rerender = false } = {}) {
  const input = document.querySelector("#apiKeyInput");
  const raw = input?.value || state.apiKey || safeSessionGet(SESSION_API_KEY) || "";
  const key = normalizeApiKey(raw);
  state.apiKey = key;
  safeSessionSet(SESSION_API_KEY, key);
  if (input && input.value !== key) input.value = key;
  if (showNotice && key) notify("success", "API 키 인식됨", "이제 분석하기를 눌러 주세요.");
  if (rerender) render();
  return key;
}

function persistSettings() {
  saveSettings({
    theme: state.theme,
    model: state.model,
    reasoningModel: state.reasoningModel,
    gradingModel: state.gradingModel,
    useReasoning: state.useReasoning,
    reasoningEffort: state.reasoningEffort,
    demoMode: state.demoMode,
    questionSettings: normalizeQuestionSettings(state.questionSettings)
  });
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function structuredCloneSafe(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value || {}));
  }
}

function normalizeQuestionSettings(value = {}) {
  const base = createDefaultQuestionSettings();
  const next = {
    ...base,
    ...(value || {}),
    counts: { ...base.counts, ...(value?.counts || {}) },
    lengths: { ...base.lengths, ...(value?.lengths || {}) },
    typeDifficulties: { ...base.typeDifficulties, ...(value?.typeDifficulties || {}) }
  };
  if (!["low", "medium", "high"].includes(next.difficulty)) next.difficulty = "medium";
  if (!["small", "medium", "large"].includes(next.amount)) next.amount = "medium";
  if (next.singlePass) {
    if (next.difficulty === "high") next.difficulty = "medium";
    if (next.amount === "large") next.amount = "medium";
  }
  next.counts.multipleChoice = clamp(Number(next.counts.multipleChoice || 5), 1, 12);
  next.counts.ox = clamp(Number(next.counts.ox || 10), 1, 30);
  next.counts.shortAnswer = clamp(Number(next.counts.shortAnswer || 5), 1, 10);
  for (const key of ["multipleChoice", "ox", "shortAnswer"]) {
    next.lengths[key] = clamp(Number(next.lengths[key] || 2), 1, 3);
    if (!["low", "medium", "high"].includes(next.typeDifficulties[key])) next.typeDifficulties[key] = next.difficulty;
  }
  return next;
}

function getEffectiveQuestionSettings() {
  const settings = normalizeQuestionSettings(state.questionSettings);
  if (!settings.advancedOpen) {
    const preset = QUESTION_AMOUNT_PRESETS[settings.amount] || QUESTION_AMOUNT_PRESETS.medium;
    settings.counts = { multipleChoice: preset.multipleChoice, ox: preset.ox, shortAnswer: preset.shortAnswer };
    settings.lengths = { multipleChoice: 2, ox: 2, shortAnswer: 2 };
    settings.typeDifficulties = { multipleChoice: settings.difficulty, ox: settings.difficulty, shortAnswer: settings.difficulty };
  }
  if (settings.singlePass) {
    settings.counts.multipleChoice = Math.min(settings.counts.multipleChoice, 5);
    settings.counts.ox = Math.min(settings.counts.ox, 10);
    settings.counts.shortAnswer = Math.min(settings.counts.shortAnswer, 5);
  }
  return normalizeQuestionSettings(settings);
}

function setQuestionSettings(patch = {}) {
  state.questionSettings = normalizeQuestionSettings({ ...state.questionSettings, ...patch });
  persistSettings();
}

function setQuestionNestedSetting(group, key, value) {
  const current = normalizeQuestionSettings(state.questionSettings);
  current[group] = { ...(current[group] || {}), [key]: value };
  state.questionSettings = normalizeQuestionSettings(current);
  persistSettings();
}

function questionDifficultyText(value) {
  return QUESTION_DIFFICULTY_LABELS[value] || "중";
}


function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatInlineMarkdown(value = "") {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]{1,160})`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]{1,280})\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]{1,280})__/g, '<strong>$1</strong>');
  return html;
}

function renderMarkdownText(value = "") {
  const raw = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!raw) return `<div class="rich-markdown muted">내용이 없습니다.</div>`;

  const lines = raw.split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(`<p>${formatInlineMarkdown(paragraph.join(" ").replace(/\s+/g, " ").trim())}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    const tag = list.type === "ol" ? "ol" : "ul";
    blocks.push(`<${tag}>${list.items.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    list = null;
  }

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^[-*_]{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push("<hr>");
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(4, heading[1].length);
      blocks.push(`<h${level + 2}>${formatInlineMarkdown(heading[2])}</h${level + 2}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return `<div class="rich-markdown">${blocks.join("")}</div>`;
}

function shorten(value = "", max = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}


function cssEscape(value = "") {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderRichText(text = "", options = {}) {
  const analysis = state.analysis || {};
  const terms = [
    ...(analysis.glossary || []).map((g) => g.term),
    ...(analysis.highlights || []).map((h) => sanitizeHighlightText(h.text)).filter((v) => v && v.length <= 18),
  ]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter((v, i, arr) => v.length >= 2 && arr.indexOf(v) === i)
    .sort((a, b) => b.length - a.length)
    .slice(0, 28);

  let html = escapeHtml(text);
  for (const term of terms) {
    const safe = escapeHtml(term);
    if (!safe || !html.includes(safe)) continue;
    html = html.replace(new RegExp(escapeRegExp(safe), "g"), `<span class="rich-term">${safe}</span>`);
  }
  html = html
    .replace(/(그러나|하지만|반면|달리|결국|따라서|즉|그래서)/g, `<b class="rich-signal">$1</b>`)
    .replace(/(한계 상황|초월자|암호|실존|가능적 실존|상황 내존재)/g, `<strong class="rich-core">$1</strong>`);

  const sentences = html.split(/(?<=[.?!다])\s+/).filter(Boolean);
  if (options.block && sentences.length > 1) {
    return `<div class="rich-text">${sentences.map((line, i) => `<p class="rich-line ${i === 0 ? "lead" : ""}">${line}</p>`).join("")}</div>`;
  }
  return `<span class="rich-inline">${html}</span>`;
}

function sanitizeHighlightText(value = "") {
  return String(value || "")
    .replace(/[{}\[\]]/g, "")
    .replace(/\b(id|text|type|color|shortReason|detail|paragraphId)\b\s*[:=].*$/i, "")
    .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
    .trim();
}

function difficultyLabel(score) {
  const n = Number(score) || 1;
  if (n >= 4.4) return "최상";
  if (n >= 3.8) return "상";
  if (n >= 3.2) return "중상";
  if (n >= 2.4) return "중";
  if (n >= 1.7) return "중하";
  return "하";
}

function normalizeChoiceNumber(n) {
  return ["①", "②", "③", "④", "⑤"][Number(n) - 1] || String(n);
}

const VALID_HIGHLIGHT_COLORS = new Set(Object.keys(HIGHLIGHT_LABELS));

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeCssEscape(value = "") {
  if (globalThis.CSS && typeof CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
}

function clampScore(value, min = 1, max = 5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return clamp(n, min, max);
}

function normalizeAnalysisResult(raw = {}, passage = state.passage) {
  const a = structuredCloneSafe(raw || {});
  const fallbackParagraphs = normalizeOcrText(passage || "")
    .split(/\n\s*\n/g)
    .map((text, i) => ({
      id: `p${i + 1}`,
      index: i + 1,
      role: i === 0 ? "도입" : "전개",
      summary: shorten(text, 130),
      coreClaim: shorten(text, 120),
      keywords: [],
      connections: []
    }))
    .filter((p) => p.summary);

  a.cleanedPassage = String(a.cleanedPassage || passage || "").trim();
  a.title = String(a.title || "무제 분석");
  a.field = String(a.field || "국어 지문");
  a.overallSummary = String(a.overallSummary || "분석 요약이 없습니다.");
  a.readingGuide = String(a.readingGuide || "문단별 핵심어와 연결 관계를 중심으로 읽어 보세요.");
  a.difficulty = a.difficulty && typeof a.difficulty === "object" ? a.difficulty : {};
  a.difficulty.score = clampScore(a.difficulty.score ?? 2.5);
  a.difficulty.level = String(a.difficulty.level || difficultyLabel(a.difficulty.score));
  a.difficulty.reason = String(a.difficulty.reason || "난이도 사유가 없습니다.");
  a.difficulty.criteria = ensureArray(a.difficulty.criteria).slice(0, 5).map((c, i) => ({
    name: String(c?.name || ["개념 밀도", "문장 난도", "구조 복잡도", "추론 요구도", "선지 함정 가능성"][i] || `기준 ${i + 1}`),
    score: clampScore(c?.score ?? a.difficulty.score),
    reason: String(c?.reason || "세부 평가가 없습니다.")
  }));
  while (a.difficulty.criteria.length < 5) {
    const i = a.difficulty.criteria.length;
    a.difficulty.criteria.push({ name: ["개념 밀도", "문장 난도", "구조 복잡도", "추론 요구도", "선지 함정 가능성"][i], score: a.difficulty.score, reason: "자동 보정된 평가 기준입니다." });
  }
  a.difficulty.trapPoints = ensureArray(a.difficulty.trapPoints).map(String).filter(Boolean).slice(0, 8);

  a.paragraphs = ensureArray(a.paragraphs).length ? ensureArray(a.paragraphs) : fallbackParagraphs;
  a.paragraphs = a.paragraphs.map((p, i) => ({
    id: String(p?.id || `p${i + 1}`),
    index: Number(p?.index || i + 1),
    role: String(p?.role || "문단 역할"),
    summary: String(p?.summary || "문단 요약이 없습니다."),
    coreClaim: String(p?.coreClaim || p?.summary || "핵심 내용이 없습니다."),
    keywords: ensureArray(p?.keywords).map(String).filter(Boolean),
    connections: ensureArray(p?.connections).map(String).filter(Boolean)
  }));

  a.flow = ensureArray(a.flow).map(String).filter(Boolean);
  if (!a.flow.length) a.flow = a.paragraphs.map((p) => p.role).filter(Boolean).slice(0, 6);
  a.structureTimeline = ensureArray(a.structureTimeline).map((item, i) => ({
    label: String(item?.label || a.paragraphs[i]?.role || `구조 ${i + 1}`),
    paragraphIds: ensureArray(item?.paragraphIds).map(String).filter(Boolean),
    description: String(item?.description || a.paragraphs[i]?.summary || "구조 설명이 없습니다.")
  }));
  if (!a.structureTimeline.length) {
    a.structureTimeline = a.paragraphs.map((p) => ({ label: p.role, paragraphIds: [p.id], description: p.summary }));
  }

  a.highlights = ensureArray(a.highlights).map((h, i) => ({
    id: String(h?.id || `h${i + 1}`),
    paragraphId: String(h?.paragraphId || a.paragraphs[0]?.id || "p1"),
    text: sanitizeHighlightText(h?.text || ""),
    type: String(h?.type || HIGHLIGHT_LABELS[h?.color] || "핵심"),
    color: VALID_HIGHLIGHT_COLORS.has(h?.color) ? h.color : "claim",
    shortReason: String(h?.shortReason || "이 구절은 지문 구조를 판단하는 데 필요합니다."),
    detail: String(h?.detail || h?.shortReason || "이 구절이 앞뒤 내용과 어떻게 연결되는지 확인해 보세요.")
  })).filter((h) => h.text && h.text.length < 220);

  a.comparisons = ensureArray(a.comparisons).map((c, i) => ({
    id: String(c?.id || `c${i + 1}`),
    axis: String(c?.axis || "비교 기준"),
    a: String(c?.a || "A"),
    b: String(c?.b || "B"),
    meaning: String(c?.meaning || "두 개념의 차이를 확인하세요."),
    paragraphIds: ensureArray(c?.paragraphIds).map(String).filter(Boolean),
    sourceDetail: String(c?.sourceDetail || "")
  }));
  a.glossary = ensureArray(a.glossary).map((g) => ({
    term: String(g?.term || "개념"),
    meaning: String(g?.meaning || "개념 설명이 없습니다."),
    inTextMeaning: String(g?.inTextMeaning || g?.meaning || "지문 속 의미가 없습니다."),
    sourceText: String(g?.sourceText || g?.term || ""),
    paragraphIds: ensureArray(g?.paragraphIds).map(String).filter(Boolean),
    easyExample: String(g?.easyExample || "")
  }));
  a.trickySentences = ensureArray(a.trickySentences).map((t) => ({
    sentence: String(t?.sentence || ""),
    paragraphId: String(t?.paragraphId || ""),
    whyHard: String(t?.whyHard || ""),
    easyRewrite: String(t?.easyRewrite || t?.sentence || ""),
    testPoint: String(t?.testPoint || "")
  })).filter((t) => t.sentence);

  a.mindmap = a.mindmap && typeof a.mindmap === "object" ? a.mindmap : {};
  a.mindmap.nodes = ensureArray(a.mindmap.nodes).map((n, i) => ({
    id: String(n?.id || `n${i + 1}`),
    label: String(n?.label || `개념 ${i + 1}`),
    kind: String(n?.kind || (i === 0 ? "center" : "node")),
    summary: String(n?.summary || "")
  }));
  if (!a.mindmap.nodes.length) a.mindmap.nodes = [{ id: "main", label: a.title, kind: "center", summary: a.overallSummary }];
  const nodeIds = new Set(a.mindmap.nodes.map((n) => n.id));
  a.mindmap.edges = ensureArray(a.mindmap.edges).map((e) => ({
    source: String(e?.source || ""),
    target: String(e?.target || ""),
    label: String(e?.label || "")
  })).filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target) && e.source !== e.target);
  if (!a.mindmap.edges.length && a.mindmap.nodes.length > 1) {
    const center = a.mindmap.nodes[0].id;
    a.mindmap.edges = a.mindmap.nodes.slice(1).map((n) => ({ source: center, target: n.id, label: "연결" }));
  }

  a.studyTips = ensureArray(a.studyTips).map(String).filter(Boolean);
  a.suggestedReaderQuestions = ensureArray(a.suggestedReaderQuestions).map(String).filter(Boolean).slice(0, 6);
  if (!a.suggestedReaderQuestions.length) {
    a.suggestedReaderQuestions = ["이 지문의 핵심 논리 연결을 설명해줘", "핵심 개념을 쉬운 예시로 설명해줘", "문제 선지로 바뀌면 어디가 함정이 될지 알려줘", "비교·대조되는 개념을 정리해줘"];
  }
  return a;
}

function normalizeQuestionSet(raw = {}) {
  const qset = structuredCloneSafe(raw || {});
  qset.multipleChoice = ensureArray(qset.multipleChoice).map((q, i) => {
    const answer = Number(q?.answer || 1);
    let choices = ensureArray(q?.choices).map((c, ci) => ({
      number: Number(c?.number || ci + 1),
      text: String(c?.text || ""),
      isAnswer: Boolean(c?.isAnswer),
      explanation: String(c?.explanation || "해설이 없습니다.")
    })).filter((c) => c.text);
    choices.sort((a, b) => a.number - b.number);
    choices = choices.slice(0, 5).map((c, ci) => ({ ...c, number: ci + 1 }));
    const answerIndex = clamp(Number.isFinite(answer) ? answer : 1, 1, Math.max(1, choices.length));
    choices = choices.map((c) => ({ ...c, isAnswer: c.number === answerIndex }));
    while (choices.length < 5) {
      const n = choices.length + 1;
      choices.push({ number: n, text: `선지 ${n}`, isAnswer: n === answerIndex, explanation: "자동 보정된 선지입니다." });
    }
    return {
      id: String(q?.id || `mc${i + 1}`),
      type: String(q?.type || "5지선다"),
      difficulty: String(q?.difficulty || "중"),
      sourceIntent: String(q?.sourceIntent || "지문 핵심 관계 확인"),
      question: String(q?.question || "윗글을 이해한 내용으로 적절한 것은?"),
      passageExtract: String(q?.passageExtract || ""),
      viewBox: String(q?.viewBox || ""),
      choiceDesignFirst: ensureArray(q?.choiceDesignFirst).map((d, di) => ({
        choiceNumber: Number(d?.choiceNumber || di + 1),
        plannedRole: String(d?.plannedRole || "선지 역할"),
        reasonBeforeWritingChoice: String(d?.reasonBeforeWritingChoice || "선지 설계 설명이 없습니다.")
      })).slice(0, 5),
      choices,
      answer: answerIndex,
      finalExplanation: String(q?.finalExplanation || "해설이 없습니다.")
    };
  });
  qset.ox = ensureArray(qset.ox).map((q, i) => ({
    id: String(q?.id || `ox${i + 1}`),
    statement: String(q?.statement || "진술이 없습니다."),
    answer: String(q?.answer || "O").toUpperCase() === "X" ? "X" : "O",
    explanation: String(q?.explanation || "해설이 없습니다."),
    trap: String(q?.trap || "")
  }));
  qset.shortAnswer = ensureArray(qset.shortAnswer).map((q, i) => ({
    id: String(q?.id || `short${i + 1}`),
    type: String(q?.type || "서술형"),
    question: String(q?.question || "지문의 핵심 내용을 서술하시오."),
    idealAnswer: String(q?.idealAnswer || "모범 답안이 없습니다."),
    gradingPoints: ensureArray(q?.gradingPoints).map(String).filter(Boolean),
    sampleWrongAnswer: String(q?.sampleWrongAnswer || "")
  }));
  qset.weaknessGuide = ensureArray(qset.weaknessGuide).map((w) => ({
    weakness: String(w?.weakness || "약점"),
    symptom: String(w?.symptom || ""),
    howToFix: String(w?.howToFix || "")
  }));
  return qset;
}

function resetQuestionState() {
  state.userAnswers = { mc: {}, ox: {}, short: {} };
  state.revealAnswers = { mc: {}, ox: {}, short: {} };
  state.shortGrades = {};
  state.shortGradeLoading = {};
  state.shortGradeConfirm = {};
  state.qnaInputs = {};
  state.qnaMessages = {};
  state.qnaLoading = null;
  state.qnaOpen = {};
}

function runExclusive(key, task) {
  if (!state.inFlight || typeof state.inFlight !== "object") state.inFlight = {};
  if (state.inFlight[key]) {
    notify("info", "이미 처리 중입니다", "현재 작업이 끝난 뒤 다시 눌러 주세요.");
    return Promise.resolve(null);
  }
  state.inFlight[key] = true;
  return Promise.resolve()
    .then(task)
    .catch((error) => {
      // 각 작업 내부 catch가 놓친 예외까지 토스트 로그로 남겨 버튼이 조용히 먹통처럼 보이지 않게 합니다.
      notify("error", "작업 실행 오류", error?.message || "알 수 없는 오류가 발생했습니다.", error?.stack || String(error));
      return null;
    })
    .finally(() => {
      if (state.inFlight) delete state.inFlight[key];
    });
}

function debounce(fn, delay = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function notify(type, title, message, details = "") {
  const toast = { id: uid("toast"), type, title, message, details, createdAt: Date.now() };
  state.toasts.unshift(toast);
  state.toasts = state.toasts.slice(0, 4);
  const isSticky = type === "error" || Boolean(details);
  if (isSticky) state.logs.unshift(toast);
  renderToastsOnly();
  if (!isSticky) {
    window.setTimeout(() => closeToast(toast.id), 3000);
  }
  return toast.id;
}

function closeToast(id) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  renderToastsOnly();
}

function renderToastsOnly() {
  const wrap = document.querySelector("#toastStack");
  if (!wrap) return;
  wrap.innerHTML = renderToastItems();
  attachToastEvents(wrap);
}

function renderToastItems() {
  return state.toasts.map((t) => `
    <div class="toast ${escapeHtml(t.type)}" data-toast="${escapeHtml(t.id)}">
      <button class="toast-x" data-close-toast="${escapeHtml(t.id)}" title="닫기">×</button>
      <b>${escapeHtml(t.title)}</b>
      <p>${escapeHtml(t.message)}</p>
      ${t.details ? `<button class="toast-log" data-open-log="${escapeHtml(t.id)}">오류 로그 보기</button>` : ""}
    </div>`).join("");
}

function attachToastEvents(root = document) {
  root.querySelectorAll("[data-close-toast]").forEach((el) => el.addEventListener("click", () => closeToast(el.dataset.closeToast)));
  root.querySelectorAll("[data-open-log]").forEach((el) => el.addEventListener("click", () => { state.logOpen = true; render(); }));
}

function normalizeOcrText(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/\n\s*\n/g)
    .map((block) => block
      .split(/\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.?!:;])/g, "$1")
      .replace(/([가-힣])\s+([,.?!])/g, "$1$2")
      .trim())
    .filter(Boolean);
  return blocks.join("\n\n");
}

function getModelPreset(id) {
  return MODEL_PRESETS.find((m) => m.id === id) || MODEL_PRESETS.find((m) => m.id === "custom");
}

function render({ preserveScroll = true } = {}) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  const panelScrolls = preserveScroll ? Array.from(document.querySelectorAll('[data-scroll-key]')).map((el) => [el.dataset.scrollKey, el.scrollTop]) : [];
  document.documentElement.dataset.theme = state.theme;
  if (!state.started) {
    app.innerHTML = renderIntro();
    attachIntroEvents();
    return;
  }
  app.innerHTML = renderApp();
  attachAppEvents();
  attachToastEvents();
  requestAnimationFrame(() => {
    renderMindmap();
    if (preserveScroll) {
      for (const [key, top] of panelScrolls) {
        const el = document.querySelector(`[data-scroll-key="${key}"]`);
        if (el) el.scrollTop = top;
      }
      window.scrollTo(0, scrollY);
    }
  });
}

function renderIntro() {
  return `
    <main class="app-shell">
      <section class="intro">
        <span class="sparkle s1"></span><span class="sparkle s2"></span><span class="sparkle s3"></span><span class="sparkle s4"></span>
        <div class="intro-card">
          <div class="intro-badge">✦ 반짝반짝, 저는 국어 지문 분석기에요</div>
          <h1><span class="gradient-text">반짝국어</span><br/>AI Reader</h1>
          <p>지문을 넣으면 문단별 요약, 구조 타임라인, 색상별 형광펜, 인터랙티브 마인드맵, 고난도 문제와 OX·서술형 퀴즈까지 한 번에 정리합니다. 암기가 아니라 이해와 추론을 위한 도구입니다.</p>
          <div class="intro-actions">
            <button class="btn primary" id="startBtn">시작하기</button>
            <button class="btn" id="demoStartBtn">샘플 지문으로 보기</button>
            <button class="btn ghost" id="themeIntroBtn">${state.theme === "dark" ? "브라이트 모드" : "다크 모드"}</button>
          </div>
        </div>
      </section>
    </main>`;
}

function renderApp() {
  return `
    <main class="app-shell">
      ${renderTopbar()}
      <section class="layout">
        ${renderReaderPanel()}
        ${renderAnalysisPanel()}
        ${renderMindmapPanel()}
      </section>
      ${renderTooltip()}
      ${renderDrawer()}
      ${renderSideMenu()}
      ${renderModelPicker()}
      ${renderLogPanel()}
      ${renderExportModal()}
      <div class="toast-stack" id="toastStack">${renderToastItems()}</div>
    </main>`;
}

function renderTopbar() {
  const modelShown = state.useReasoning ? state.reasoningModel : state.model;
  return `
    <header class="topbar">
      <div class="brand">
        <div class="logo">국</div>
        <div>
          <div class="brand-title">반짝국어</div>
          <div class="brand-sub">${escapeHtml(state.analysis?.title || "AI 지문 분석 작업실")} · ${escapeHtml(modelShown)}</div>
        </div>
      </div>
      <div class="top-actions">
        <button class="btn small" id="newNoteBtn">새 분석 노트</button>
        <button class="btn small" id="sampleBtn">${state.sampleActive ? "내 지문" : "샘플"}</button>
        <button class="btn small" id="saveBtn" ${state.analysis ? "" : "disabled"}>저장</button>
        <button class="btn small primary" id="exportBtn" ${state.analysis ? "" : "disabled"}>내보내기</button>
        <button class="btn small menu-btn" id="menuBtn" title="설정 열기">☰ 메뉴</button>
      </div>
    </header>`;
}

function renderReaderPanel() {
  const hasAnalysis = !!state.analysis;
  return `
    <article class="panel reader-panel">
      <div class="panel-head">
        <div class="panel-title">지문 <small>${hasAnalysis ? "드래그하면 AI 설명 메모를 만들 수 있습니다" : "분석할 지문을 넣어 주세요"}</small></div>
        <div class="reader-tools">
          <button class="btn small primary" id="analyzeBtn">분석하기</button>
        </div>
      </div>
      <div class="panel-body" data-scroll-key="reader">
        ${renderInputGuide(hasAnalysis)}
        ${state.loading && state.loading !== "questions" ? renderLoading() : ""}
        ${hasAnalysis ? renderHighlightFilters() : ""}
        ${hasAnalysis ? renderReaderAskCard() : ""}
        <div style="height: 12px"></div>
        ${hasAnalysis ? renderReaderContent() : renderEditor()}
      </div>
    </article>`;
}

function renderInputGuide(hasAnalysis) {
  const key = normalizeApiKey(state.apiKey || safeSessionGet(SESSION_API_KEY));
  return `
    <div class="reader-guide">
      <div>
        <b>${hasAnalysis ? "분석 결과 보기" : "지문 입력"}</b>
        <span>${escapeHtml(OCR_GUIDE)}</span>
      </div>
      <div class="reader-guide-actions">
        ${hasAnalysis ? "" : `<button class="btn small" id="ocrCleanBtn">OCR 정리</button><button class="btn small" id="aiCleanBtn">AI 정돈</button>`}
        <button class="btn small ghost" id="quickMenuBtn">설정 ${key ? "· 키 인식됨" : "· 키 필요"}</button>
      </div>
    </div>`;
}

function renderSettings() {
  const normalPreset = getModelPreset(state.model);
  const reasoningPreset = getModelPreset(state.reasoningModel);
  const gradingPreset = getModelPreset(state.gradingModel);
  return `
    <div class="settings-stack">
      <div class="field">
        <label>OpenAI API Key ${state.demoMode ? "(데모 모드에서는 선택)" : ""}</label>
        <div class="inline-control">
          <input class="input" id="apiKeyInput" type="password" placeholder="sk-..." value="${escapeHtml(state.apiKey)}" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button class="btn small" id="apiKeyApplyBtn" type="button">키 적용</button>
        </div>
        <div class="key-status ${state.apiKey ? "ok" : ""}" id="apiKeyStatus">${escapeHtml(getMaskedKeyLabel())}</div>
      </div>

      <div class="field">
        <label>일반 분석 모델</label>
        <div class="inline-control">
          <input class="input" id="modelInput" value="${escapeHtml(state.model)}" placeholder="gpt-4.1-mini" />
          <button class="btn small" data-model-picker="normal">모델 선택</button>
        </div>
        <div class="model-mini">${escapeHtml(normalPreset?.tag || "사용자 지정")} · 입력 ${escapeHtml(normalPreset?.input || "-")} · 출력 ${escapeHtml(normalPreset?.output || "-")}</div>
      </div>

      <div class="field">
        <label>전문 추론 모델</label>
        <div class="inline-control">
          <input class="input" id="reasoningModelInput" value="${escapeHtml(state.reasoningModel)}" placeholder="gpt-5.5" />
          <button class="btn small" data-model-picker="reasoning">모델 선택</button>
        </div>
        <div class="model-mini">${escapeHtml(reasoningPreset?.tag || "사용자 지정")} · 입력 ${escapeHtml(reasoningPreset?.input || "-")} · 출력 ${escapeHtml(reasoningPreset?.output || "-")}</div>
      </div>

      <div class="field">
        <label>저비용 모델 <small>AI 정돈 · AI 댓글 · 서술형 채점</small></label>
        <div class="inline-control">
          <input class="input" id="gradingModelInput" value="${escapeHtml(state.gradingModel)}" placeholder="gpt-4.1-mini" />
          <button class="btn small" data-model-picker="grading">모델 선택</button>
        </div>
        <div class="model-mini">${escapeHtml(gradingPreset?.tag || "사용자 지정")} · 입력 ${escapeHtml(gradingPreset?.input || "-")} · 출력 ${escapeHtml(gradingPreset?.output || "-")}</div>
      </div>

      <div class="field">
        <label>추론 강도</label>
        <select class="select" id="effortSelect">
          ${["low", "medium", "high"].map((e) => `<option value="${e}" ${state.reasoningEffort === e ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </div>

      <div class="filter-row">
        <label class="chip ${state.demoMode ? "" : "off"}"><input type="checkbox" id="demoToggle" ${state.demoMode ? "checked" : ""}/> 데모 모드</label>
        <label class="chip ${state.useReasoning ? "" : "off"}"><input type="checkbox" id="reasoningToggle" ${state.useReasoning ? "checked" : ""}/> 전문 추론 모델 사용</label>
      </div>

      <div class="side-actions">
        <button class="btn full" id="themeBtn">${state.theme === "dark" ? "☀ 브라이트 모드" : "☾ 다크 모드"}</button>
        <button class="btn full" id="resetBtn">처음으로 돌아가기</button>
        <details class="menu-info"><summary>ⓘ 비용·보안 안내</summary><p>전문 추론 모델은 분석 품질이 좋아질 수 있지만 토큰 사용량과 비용이 더 커질 수 있습니다. GitHub Pages 정적 배포에서는 API 키가 브라우저에서 직접 사용됩니다. 이 앱은 키를 sessionStorage에만 두고 저장하지 않지만, 공개 서비스로 운영할 때는 서버 프록시를 붙이는 편이 안전합니다.</p></details>
      </div>
    </div>`;
}

function renderEditor() {
  return `
    <textarea class="textarea" id="passageInput" placeholder="여기에 국어 지문을 붙여 넣으세요. 문단은 빈 줄로 구분하면 분석이 더 깔끔합니다.">${escapeHtml(state.passage)}</textarea>`;
}

function renderLoading() {
  const isQuestion = state.loading === "questions";
  const questionPhase = state.questionPhase || "문제 제작 준비";
  const steps = state.loading === "analysis"
    ? ["문단 분리", "띄어쓰기 정돈", "핵심 주장 탐색", "형광펜 설계", "마인드맵 구성", "학습 포인트 정리"]
    : state.loading === "note"
      ? ["선택 구절 확인", "앞뒤 문맥 연결", "쉬운 설명 작성", "시험 포인트 정리"]
      : state.loading === "cleanup"
        ? ["OCR 문장 확인", "띄어쓰기 정돈", "문단 보존", "지문 입력창 반영"]
        : state.questionSettings?.singlePass
          ? ["출제 범위 압축", "5지선다 구성", "OX 구성", "서술형 구성", "JSON 마무리"]
          : (questionPhase.includes("OX") || questionPhase.includes("서술형"))
            ? ["2차 호출 시작", "OX 진술 설계", "서술형 질문 설계", "채점 기준 작성", "JSON 마무리"]
            : ["1차 호출 시작", "출제 의도 설계", "선지별 함정 설계", "5지선다 구성", "JSON 마무리"];
  const activeIndex = Math.min(steps.length - 1, Math.floor((state.loadingProgress / 100) * steps.length));
  const title = state.loading === "analysis"
    ? "분석 중이에요. 잠시만 기다려 주세요"
    : state.loading === "note"
      ? "메모 설명 생성 중"
      : state.loading === "cleanup"
        ? "AI 지문 정돈 중"
        : `문제 제작 중이에요 · ${questionPhase}`;
  return `
    <div class="card loading-card-strong">
      <h3>${escapeHtml(title)}</h3>
      <div class="progress"><span style="width:${state.loadingProgress}%"></span></div>
      <div class="loading-steps">
        ${steps.map((s, i) => `<div class="loading-step ${i === activeIndex ? "active" : ""}">${i <= activeIndex ? "✦" : "·"} ${escapeHtml(s)}</div>`).join("")}
      </div>
      ${isQuestion && !state.questionSettings?.singlePass ? `<p class="notice compact">호출을 2번으로 나누어 진행합니다. 1차가 끝나면 게이지가 다시 차면서 2차 OX·서술형 제작을 시작합니다.</p>` : ""}
    </div>`;
}

function renderHighlightFilters() {
  return `
    <div class="filter-row">
      ${Object.entries(HIGHLIGHT_LABELS).map(([key, label]) => `
        <button class="chip ${state.filters[key] ? "" : "off"}" data-filter="${key}"><span class="dot ${key}"></span>${label}</button>
      `).join("")}
    </div>`;
}


function getReaderQuestionSuggestions() {
  const generated = ensureArray(state.analysis?.suggestedReaderQuestions)
    .map((q) => String(q || "").trim())
    .filter(Boolean);
  const fallback = [
    "이 지문에서 제일 헷갈리기 쉬운 논리 연결을 설명해줘",
    "핵심 개념을 쉬운 예시로 설명해줘",
    "문제 선지로 바뀌면 어디가 함정이 될지 알려줘",
    "비교·대조되는 개념을 다시 정리해줘"
  ];
  return [...generated, ...fallback].filter((q, i, arr) => arr.indexOf(q) === i).slice(0, 6);
}

function renderReaderAskCard() {
  if (state.readerAskCollapsed) {
    return `<div class="reader-ai-card collapsed">
      <div class="reader-ai-head compact-head">
        <div><b>AI에게 질문하기</b><span>답변은 메모 탭에 저장됩니다</span></div>
        <button class="btn icon-only" id="toggleReaderAskBtn" title="펼치기" aria-label="펼치기">⌄</button>
      </div>
    </div>`;
  }
  const fallbackSuggestions = [
    "이 지문에서 제일 헷갈리기 쉬운 논리 연결을 설명해줘",
    "핵심 개념을 쉬운 예시로 설명해줘",
    "문제 선지로 바뀌면 어디가 함정이 될지 알려줘",
    "비교·대조되는 개념을 다시 정리해줘"
  ];
  const suggestions = (state.analysis?.suggestedReaderQuestions?.length
    ? state.analysis.suggestedReaderQuestions
    : fallbackSuggestions
  ).slice(0, 6);
  return `<div class="reader-ai-card">
    <div class="reader-ai-head">
      <div><b>AI에게 질문하기</b><span>답변은 메모 탭에 저장됩니다${state.selectedText ? ` · 현재 선택: “${escapeHtml(shorten(state.selectedText, 34))}”` : ""}</span></div>
      <div class="reader-ai-actions">
        ${state.memoAskLoading ? `<div class="tiny-loader"><span></span>답변 작성 중</div>` : ""}
        <button class="btn icon-only" id="toggleReaderAskBtn" title="접기" aria-label="접기">⌃</button>
      </div>
    </div>
    <div class="suggestion-row">${suggestions.map((q) => `<button class="suggestion-chip" data-reader-quick="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("")}</div>
    <div class="inline-control memo-inline">
      <input class="input" id="readerMemoQuestion" value="${escapeHtml(state.memoAskInput || "")}" placeholder="지문에 대해 궁금한 점을 물어보세요. 예: 이 부분 예시 들어줘, 더 쉽게 설명해줘" />
      <button class="btn small primary" id="readerMemoAskBtn" ${state.memoAskLoading ? "disabled" : ""}>질문</button>
    </div>
  </div>`;
}

function renderReaderContent() {
  const paragraphs = splitParagraphs(state.passage);
  return `<div class="reader-content" id="readerContent">
    ${paragraphs.map((text, i) => renderParagraph(text, i + 1)).join("")}
  </div>`;
}

function splitParagraphs(text) {
  return String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function renderParagraph(text, index) {
  const pid = `p${index}`;
  const html = applyHighlights(text, pid);
  const paragraph = state.analysis?.paragraphs?.find((p) => p.id === pid);
  return `
    <p class="paragraph ${state.flash?.pid === pid ? "flash-paragraph" : ""}" id="${pid}" data-pid="${pid}">
      <span class="p-index">${index}</span>
      ${html}
      ${paragraph ? `<br><span class="badge">${escapeHtml(paragraph.role)}</span>` : ""}
    </p>`;
}

function applyHighlights(text, paragraphId) {
  const source = String(text || "");
  const highlights = (state.analysis?.highlights || [])
    .map((h) => ({ ...h, text: sanitizeHighlightText(h.text) }))
    .filter((h) => h.paragraphId === paragraphId && h.text && !/[{}\[\]]/.test(h.text) && state.filters[h.color])
    .sort((a, b) => b.text.length - a.text.length);

  const groups = new Map();
  for (const h of highlights) {
    const key = h.text;
    if (!source.includes(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }

  let output = escapeHtml(source);
  const uniqueTexts = [...groups.keys()].sort((a, b) => b.length - a.length);
  for (const rawText of uniqueTexts) {
    const group = groups.get(rawText);
    const escaped = escapeHtml(rawText);
    const colors = [...new Set(group.map((h) => h.color))];
    const ids = group.map((h) => h.id).join(",");
    const labels = group.map((h) => h.type).join(" · ");
    const reasons = group.map((h) => h.shortReason).join(" / ");
    const cls = colors.join(" ");
    const style = colors.length > 1 ? ` style="background:${buildLayeredHighlight(colors)}"` : "";
    const replacement = `<mark class="hl ${cls} multi-${Math.min(colors.length, 4)}"${style} data-hid="${escapeHtml(ids)}" data-title="${escapeHtml(labels)}" data-reason="${escapeHtml(reasons)}">${escaped}</mark>`;
    output = output.replace(escaped, replacement);
  }
  if (state.flash?.text) {
    const escapedFlash = escapeHtml(state.flash.text);
    output = output.replace(escapedFlash, `<span class="source-flash">${escapedFlash}</span>`);
  }
  return output.replaceAll("\n", "<br>");
}

function buildLayeredHighlight(colors) {
  const vars = {
    claim: "var(--claim)", evidence: "var(--evidence)", contrast: "var(--contrast)", definition: "var(--definition)", example: "var(--example)", warning: "var(--warning)", support: "var(--support)"
  };
  if (colors.length <= 1) return vars[colors[0]] || "var(--claim)";
  const stops = colors.map((c, i) => {
    const a = Math.round((i / colors.length) * 100);
    const b = Math.round(((i + 1) / colors.length) * 100);
    return `${vars[c] || "var(--claim)"} ${a}% ${b}%`;
  }).join(", ");
  return `linear-gradient(90deg, ${stops})`;
}

function renderAnalysisPanel() {
  return `
    <aside class="panel">
      <div class="tabs">
        ${[
          ["summary", "요약"], ["structure", "구조"], ["concepts", "개념"], ["questions", "문제"], ["notes", "메모"], ["saved", "저장"], ["comments", "AI 댓글"]
        ].map(([id, label]) => `<button class="tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}
      </div>
      <div class="tab-content" data-scroll-key="analysis-tab">
        ${renderTabContent()}
      </div>
    </aside>`;
}

function renderTabContent() {
  if (!state.analysis && !["saved", "notes", "comments"].includes(state.tab)) {
    return `<div class="empty">아직 분석 결과가 없습니다.<br>지문을 넣고 <b>분석하기</b>를 눌러 주세요.</div>`;
  }
  if (state.tab === "summary") return renderSummaryTab();
  if (state.tab === "structure") return renderStructureTab();
  if (state.tab === "concepts") return renderConceptsTab();
  if (state.tab === "questions") return renderQuestionsTab();
  if (state.tab === "notes") return renderNotesTab();
  if (state.tab === "saved") return renderSavedTab();
  if (state.tab === "comments") return renderCommentsTab();
  return "";
}

function renderSummaryTab() {
  const a = state.analysis;
  const criteria = a.difficulty.criteria || [];
  const safeScore = Math.max(1, Math.min(5, Number(a.difficulty.score || 1))).toFixed(1).replace(/\.0$/, "");
  return `
    <div class="kv">
      <div class="card"><span class="badge">${escapeHtml(a.field)}</span><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.overallSummary)}</p></div>
      <div class="card"><h4>읽는 법</h4><p>${escapeHtml(a.readingGuide)}</p></div>
      <div class="card difficulty-card">
        <h4>난이도 ${difficultyLabel(Number(a.difficulty.score || 1))} · ${safeScore}/5</h4>
        <p>${escapeHtml(a.difficulty.reason)}</p>
        <div class="criteria-grid">
          ${criteria.map((c) => `<div class="criterion"><b>${escapeHtml(c.name)}</b><span>${Math.max(1, Math.min(5, Number(c.score || 1))).toFixed(1).replace(/\.0$/, "")}/5</span><p>${escapeHtml(c.reason)}</p></div>`).join("")}
        </div>
        <div class="chip-row">${(a.difficulty.trapPoints || []).map((t) => `<span class="chip">⚠ ${escapeHtml(t)}</span>`).join(" ")}</div>
      </div>
      <div class="card"><h4>문단별 요약</h4>${a.paragraphs.map((p) => `<button class="summary-row" data-jump="${escapeHtml(p.id)}"><span class="badge">${p.index}문단 · ${escapeHtml(p.role)}</span><p>${escapeHtml(p.summary)}</p><p><b>핵심:</b> ${escapeHtml(p.coreClaim)}</p></button>`).join("")}</div>
    </div>`;
}

function renderStructureTab() {
  const a = state.analysis;
  return `
    <div class="kv">
      <div class="card"><h4>전개 흐름</h4><div class="flow">${a.flow.map((f, i) => `<span class="flow-item">${escapeHtml(f)}</span>${i < a.flow.length - 1 ? `<span class="flow-arrow">→</span>` : ""}`).join("")}</div></div>
      <div class="card"><h4>구조 타임라인</h4><div class="timeline compact-timeline">${a.structureTimeline.map((item, i) => `<div class="timeline-row"><div class="timeline-marker">${i + 1}</div><div class="timeline-text"><div class="timeline-title"><b>${escapeHtml(item.label)}</b>${item.paragraphIds.map((pid) => `<button class="pid-pill" data-jump="${escapeHtml(pid)}">${escapeHtml(pid)}</button>`).join("")}</div><p>${escapeHtml(item.description)}</p></div></div>`).join("")}</div></div>
      <div class="card"><h4>비교·대조</h4><div class="compare-list">${a.comparisons.map((c) => `<div class="compare-row"><span class="badge">${escapeHtml(c.axis)}</span><div class="compare-pair"><strong>${escapeHtml(c.a)}</strong><span>↔</span><strong>${escapeHtml(c.b)}</strong></div><p>${escapeHtml(c.meaning)}</p><p class="source-line"><b>출처:</b> ${escapeHtml(c.sourceDetail || "")} ${c.paragraphIds.map((pid) => `<button class="pid-pill" data-jump="${escapeHtml(pid)}">${escapeHtml(pid)}</button>`).join("")}</p></div>`).join("")}</div></div>
      <div class="card"><h4>헷갈리는 문장</h4>${a.trickySentences.map((s) => `<button class="tricky-row" data-jump-sentence="${escapeHtml(s.sentence)}" data-jump="${escapeHtml(s.paragraphId || "")}" title="본문에서 확인"><b>“${escapeHtml(s.sentence)}”</b><p><b>쉽게:</b> ${escapeHtml(s.easyRewrite)}</p><span class="mini-link">본문에서 확인하기</span></button>`).join("")}</div>
    </div>`;
}

function renderConceptsTab() {
  const a = state.analysis;
  return `
    <div class="concept-list">
      ${a.glossary.map((g) => `<button class="concept-row" data-flash-text="${escapeHtml(g.sourceText || g.term)}" data-jump="${escapeHtml((g.paragraphIds || [])[0] || "")}"><div class="concept-head"><h3>${escapeHtml(g.term)}</h3>${(g.paragraphIds || []).map((pid) => `<span class="pid-static">${escapeHtml(pid)}</span>`).join("")}</div><p>${escapeHtml(g.meaning)}</p><p><b>지문 속 의미:</b> ${escapeHtml(g.inTextMeaning)}</p><p class="source-line"><b>출처:</b> ${escapeHtml(g.sourceText || "")}</p>${g.easyExample ? `<p><b>예시:</b> ${escapeHtml(g.easyExample)}</p>` : ""}</button>`).join("")}
    </div>`;
}

function renderQuestionSetup() {
  const settings = normalizeQuestionSettings(state.questionSettings);
  const effective = getEffectiveQuestionSettings();
  const disabledHigh = settings.singlePass;
  const disabledLarge = settings.singlePass;
  const diffItems = [["low", "하"], ["medium", "중"], ["high", "상"]];
  const amountItems = [["small", "적음"], ["medium", "보통"], ["large", "많음"]];
  const typeRows = [
    ["multipleChoice", "5지선다", 1, 12, "문항", "선지 길이"],
    ["ox", "OX", 1, 30, "개", "진술 길이"],
    ["shortAnswer", "서술형", 1, 10, "문항", "답안 길이"]
  ];
  return `<section class="question-setup-card">
    <div class="question-setup-head">
      <div>
        <h3>문제 제작 설정</h3>
        <p>기본 설정으로 빠르게 만들거나, 고급 설정에서 유형별 개수·난이도·길이를 조절할 수 있습니다.</p>
      </div>
      <button class="btn soft" id="questionBtn">${state.questions ? "문제 다시 제작" : "문제 제작 시작"}</button>
    </div>
    <div class="question-basic-grid">
      <div class="question-basic-block">
        <b>난이도</b>
        <div class="segmented-row">
          ${diffItems.map(([id, label]) => {
            const disabled = disabledHigh && id === "high";
            return `<button class="seg-btn ${settings.difficulty === id ? "active" : ""}" data-question-setting="difficulty" data-value="${id}" ${disabled ? "disabled" : ""}>${label}</button>`;
          }).join("")}
        </div>
        <p>${settings.singlePass ? "단일 호출 모드에서는 난이도 상을 막아 출력 부담을 줄입니다." : "상은 문단 결합과 보기 추론이 많고, 하는 꼼꼼한 내용 확인 중심입니다."}</p>
      </div>
      <div class="question-basic-block">
        <b>문제 수</b>
        <div class="segmented-row">
          ${amountItems.map(([id, label]) => {
            const disabled = disabledLarge && id === "large";
            return `<button class="seg-btn ${settings.amount === id ? "active" : ""}" data-question-setting="amount" data-value="${id}" ${disabled ? "disabled" : ""}>${label}</button>`;
          }).join("")}
        </div>
        <p>현재 기준: 5지선다 ${effective.counts.multipleChoice}문항 · OX ${effective.counts.ox}개 · 서술형 ${effective.counts.shortAnswer}문항</p>
      </div>
      <label class="single-pass-card">
        <input type="checkbox" id="singlePassQuestions" ${settings.singlePass ? "checked" : ""} />
        <span><b>추론 호출 한 번만 사용</b><em>비용과 시간을 줄이지만 문제 품질이 낮아질 수 있어요. 선택 시 난이도 상·문제 수 많음은 비활성화됩니다.</em></span>
      </label>
    </div>
    <details class="advanced-question-box" ${settings.advancedOpen ? "open" : ""}>
      <summary>고급 설정</summary>
      <div class="advanced-question-grid">
        ${typeRows.map(([key, label, min, max, unit, lengthLabel]) => `
          <div class="advanced-question-row">
            <div class="advanced-row-title"><b>${label}</b><span>${effective.counts[key]}${unit} · 난이도 ${questionDifficultyText(effective.typeDifficulties[key])} · ${QUESTION_LENGTH_LABELS[effective.lengths[key]]}</span></div>
            <label>개수 <input type="range" min="${min}" max="${max}" value="${settings.counts[key]}" data-question-count="${key}" /></label>
            <label>난이도 <input type="range" min="1" max="3" value="${settings.typeDifficulties[key] === "low" ? 1 : settings.typeDifficulties[key] === "high" ? 3 : 2}" data-question-difficulty="${key}" /></label>
            <label>${lengthLabel} <input type="range" min="1" max="3" value="${settings.lengths[key]}" data-question-length="${key}" /></label>
          </div>`).join("")}
      </div>
    </details>
  </section>`;
}


function renderQuestionsTab() {
  if (state.loading === "questions") {
    return `<div class="kv"><div class="card question-loading-card">${renderLoading()}<p class="notice compact">문제를 제작 중이에요. ${state.questionSettings?.singlePass ? "단일 호출로 모든 유형을 압축 생성하고 있습니다." : "현재 단계가 끝나면 게이지가 다시 차며 다음 호출로 넘어갑니다."}</p></div></div>`;
  }
  if (!state.analysis) {
    return `<div class="empty">먼저 지문을 분석하면 문제를 제작할 수 있습니다.</div>`;
  }
  const setup = renderQuestionSetup();
  if (!state.questions) {
    return `${setup}<div class="empty question-start-card subtle-empty"><b>아직 제작된 문제가 없습니다.</b><br>위 설정을 확인한 뒤 문제 제작을 시작하세요.</div>`;
  }
  return `
    ${setup}
    <div class="question-tab-head">
      <div class="tabs" style="padding:0;border:0">
        ${[["mc", "5지선다"], ["ox", "OX"], ["short", "서술형"]].map(([id, label]) => `<button class="tab ${state.questionTab === id ? "active" : ""}" data-qtab="${id}">${label}</button>`).join("")}
      </div>
    </div>
    ${state.questionTab === "mc" ? renderMultipleChoice() : state.questionTab === "ox" ? renderOx() : renderShortAnswer()}`;
}

function cleanViewBox(value = "") {
  const text = String(value || "").trim();
  if (!text || /^<보기>\s*A\s*,?\s*B\s*$/i.test(text)) return "";
  return text.replace(/^<보기>\s*/i, "").trim();
}

function renderMultipleChoice() {
  return (state.questions.multipleChoice || []).map((q, idx) => {
    const selected = state.userAnswers.mc[q.id];
    const revealed = !!state.revealAnswers.mc[q.id];
    const view = cleanViewBox(q.viewBox);
    return `
    <div class="card question-card" data-question="${escapeHtml(q.id)}">
      <div class="question-meta"><span class="badge">${idx + 1}</span><span class="badge">${escapeHtml(q.type)}</span><span class="badge">${escapeHtml(q.difficulty)}</span></div>
      <h3>${escapeHtml(q.question)}</h3>
      ${view ? `<div class="view-box"><b>&lt;보기&gt;</b><p>${escapeHtml(view)}</p></div>` : ""}
      <div class="choice-list exam-choice-list">
        ${q.choices.map((c) => {
          const isSelected = Number(selected) === Number(c.number);
          const isAnswer = !!c.isAnswer;
          const cls = revealed ? (isAnswer ? "correct" : isSelected ? "wrong" : "") : (isSelected ? "selected" : "");
          return `<button class="choice choice-button ${cls}" data-answer-mc="${escapeHtml(q.id)}" data-choice="${c.number}">
            <span class="choice-num">${normalizeChoiceNumber(c.number)}</span>
            <span class="choice-text">${escapeHtml(c.text)}</span>
          </button>${revealed ? `<div class="choice-explain ${isAnswer ? "correct" : isSelected ? "wrong" : ""}">${isAnswer ? "정답 이유" : isSelected ? "내가 고른 오답 이유" : "오답 이유"}: ${escapeHtml(c.explanation)}</div>` : ""}`;
        }).join("")}
      </div>
      <div class="question-actions refined-actions">
        <button class="btn small primary" data-check-mc="${escapeHtml(q.id)}">채점 및 정오 보기</button>
        <button class="btn small" data-clear-mc="${escapeHtml(q.id)}">선택 지우기</button>
        <button class="btn small ghost" data-open-qna="mc:${escapeHtml(q.id)}">AI에게 질문</button>
      </div>
      ${revealed ? `<div class="notice source-after"><b>근거 발췌:</b> ${escapeHtml(q.passageExtract || "근거 발췌 없음")}</div><details class="after-solve"><summary>출제 의도와 선지 설계 보기</summary><div class="design-list">${q.choiceDesignFirst.map((d) => `<div class="design-item"><b>${normalizeChoiceNumber(d.choiceNumber)} ${escapeHtml(d.plannedRole)}</b> — ${escapeHtml(d.reasonBeforeWritingChoice)}</div>`).join("")}</div><div class="notice" style="margin-top:10px"><b>정답 ${normalizeChoiceNumber(q.answer)}.</b> ${escapeHtml(q.finalExplanation)}</div></details>` : `<p class="hint-line">먼저 직접 선택한 뒤 채점하면 정답과 근거 발췌가 열립니다.</p>`}
      ${renderQuestionAskBox(q, "mc")}
    </div>`;
  }).join("");
}

function renderOx() {
  const list = state.questions.ox || [];
  return `<div class="ox-panel">
    <div class="question-actions ox-top-actions"><button class="btn small primary" id="checkAllOxBtn">OX 전체 채점</button><button class="btn small" id="retryAllOxBtn">전체 다시 풀기</button></div>
    <div class="ox-list">${list.map((q, idx) => {
      const selected = state.userAnswers.ox[q.id];
      const revealed = !!state.revealAnswers.ox[q.id];
      const correct = selected && selected === q.answer;
      return `<div class="ox-row ${revealed ? (correct ? "correct" : "wrong") : ""}">
        <span class="ox-no">${idx + 1}</span>
        <p>${escapeHtml(q.statement)}</p>
        <div class="ox-inline-buttons">${["O", "X"].map((v) => `<button class="ox-mini ${selected === v ? "selected" : ""} ${revealed && q.answer === v ? "correct" : ""}" data-answer-ox="${escapeHtml(q.id)}" data-choice="${v}">${v}</button>`).join("")}<button class="btn tiny" data-check-ox="${escapeHtml(q.id)}">채점</button></div>
        ${revealed ? `<div class="ox-result"><b>${correct ? "정답" : "오답"}</b> · 정답 ${escapeHtml(q.answer)} · ${escapeHtml(q.explanation)} ${q.trap ? `<span>함정: ${escapeHtml(q.trap)}</span>` : ""}<button class="btn tiny" data-clear-ox="${escapeHtml(q.id)}">다시 시도</button></div>` : ""}
      </div>`;
    }).join("")}</div>
  </div>`;
}

function renderShortAnswer() {
  const list = state.questions.shortAnswer || [];
  const anyLoading = Object.values(state.shortGradeLoading).some(Boolean);
  return `<div class="short-panel">
    <div class="question-actions short-top-actions"><button class="btn small primary" id="gradeAllShortBtn" ${anyLoading ? "disabled" : ""}>${anyLoading ? "AI 일괄 채점 중..." : "서술형 전체 AI 채점"}</button><button class="btn small" id="clearAllShortBtn">답안 전체 지우기</button></div>
    ${anyLoading ? `<div class="mini-loader"><span></span><b>저비용 채점 모델(${escapeHtml(state.gradingModel)})로 문제·모범답안·내 답안을 함께 비교하고 있습니다</b></div>` : ""}
    <div class="kv">${list.map((q, idx) => {
      const value = state.userAnswers.short[q.id] || "";
      const grade = state.shortGrades[q.id];
      return `<div class="card short-card">
        <span class="badge">${idx + 1} · ${escapeHtml(q.type)}</span>
        <h3>${escapeHtml(q.question)}</h3>
        <textarea class="short-input" data-short-input="${escapeHtml(q.id)}" placeholder="여기에 직접 답안을 작성하세요.">${escapeHtml(value)}</textarea>
        <div class="question-actions refined-actions"><button class="btn small primary" data-grade-short="${escapeHtml(q.id)}">${state.shortGradeLoading[q.id] ? "AI 채점 중..." : "이 문항 AI 채점"}</button><button class="btn small" data-clear-short="${escapeHtml(q.id)}">답안 지우기</button><button class="btn small ghost" data-open-qna="short:${escapeHtml(q.id)}">AI에게 질문</button></div>
        ${grade ? `<div class="grading-result ${grade.isAcceptable ? "correct" : "wrong"}"><h4>${escapeHtml(grade.verdict)} · ${Number(grade.score).toFixed(1).replace(/\.0$/, "")}/${grade.maxScore || 5}</h4><p><b>맞은 부분:</b> ${escapeHtml(grade.strength)}</p><p><b>부족한 부분:</b> ${escapeHtml(grade.weakness)}</p><p><b>보완 답안:</b> ${escapeHtml(grade.improvedAnswer)}</p><details><summary>채점 기준과 모범 답안 보기</summary><p><b>모범 답안:</b> ${escapeHtml(q.idealAnswer)}</p>${q.gradingPoints.map((p) => `<span class="chip">${escapeHtml(p)}</span>`).join(" ")}</details></div>` : `<p class="hint-line">전체 AI 채점을 누르면 한 번의 요청으로 서술형 답안들을 채점합니다.</p>`}
        ${renderQuestionAskBox(q, "short")}
      </div>`;
    }).join("")}</div>
  </div>`;
}

function renderQuestionAskBox(q, type) {
  const key = `${type}:${q.id}`;
  if (!state.qnaOpen[key]) return "";
  const messages = state.qnaMessages[key] || [];
  const value = state.qnaInputs[key] || "";
  const loading = state.qnaLoading === key;
  return `<div class="question-ai-box compact-ai-box">
    <div class="question-ai-title">이 문제에 대해 질문하기 <button class="btn tiny" data-close-qna="${escapeHtml(key)}">닫기</button></div>
    <div class="inline-control">
      <input class="input" data-qna-input="${escapeHtml(key)}" value="${escapeHtml(value)}" placeholder="납득 안 되는 선지나 개념을 질문해 보세요" />
      <button class="btn small" data-qna-ask="${escapeHtml(key)}" ${loading ? "disabled" : ""}>${loading ? "답변 중..." : "질문"}</button>
    </div>
    ${loading ? `<div class="mini-loader"><span></span><b>지문 근거를 확인하고 있습니다</b></div>` : ""}
    ${messages.map((m) => `<div class="qna-message"><b>Q.</b> ${escapeHtml(m.question)}<div><b>A.</b> ${renderMarkdownText(m.answer)}</div>${m.sourcePointer ? `<p><b>근거:</b> ${escapeHtml(m.sourcePointer)}</p>` : ""}</div>`).join("")}
  </div>`;
}

function renderWeakness() {
  return `<div class="kv">${(state.questions.weaknessGuide || []).map((w) => `<div class="card"><h3>${escapeHtml(w.weakness)}</h3><p><b>증상:</b> ${escapeHtml(w.symptom)}</p><p><b>개선:</b> ${escapeHtml(w.howToFix)}</p></div>`).join("")}</div>`;
}

function renderNotesTab() {
  const quicks = [
    "더 쉽게 다시 설명해줘",
    "예시를 만들어줘",
    "이 부분이 왜 중요한지 알려줘",
    "선지로 나오면 어떻게 바뀔 수 있어?"
  ];
  const selectedCard = state.selectedText ? `<div class="card memo-compose-card">
    <h4>선택한 구절</h4>
    <p class="selected-quote">“${escapeHtml(state.selectedText)}”</p>
    <div class="suggestion-row">${quicks.map((q) => `<button class="suggestion-chip" data-selected-quick="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("")}</div>
    <div class="inline-control memo-inline">
      <input class="input" id="selectedMemoQuestion" value="${escapeHtml(state.selectedMemoInput || "")}" placeholder="추가로 묻고 싶은 내용을 적어도 됩니다. 비워두면 해당 구절과 단락을 자세히 설명합니다." />
      <button class="btn small primary" id="selectedMemoAskBtn" ${state.noteLoading ? "disabled" : ""}>질문</button>
    </div>
    <button class="btn full" id="explainSelectionBtn" style="margin-top:10px" ${state.noteLoading ? "disabled" : ""}>${state.noteLoading ? "설명 생성 중..." : "질문 없이 자세한 설명 만들기"}</button>
    ${state.noteLoading ? `<div class="mini-loader"><span></span><b>선택 구절과 단락을 읽고 있습니다</b></div>` : ""}
  </div>` : `<div class="empty">지문에서 이해가 안 되는 부분을 드래그하거나, 본문 위의 AI 질문 카드를 사용하면 답변이 이곳에 저장됩니다.</div>`;

  return `<div class="kv memo-tab-shell">
    ${selectedCard}
    ${state.memoAskLoading && !state.selectedText ? `<div class="card"><div class="mini-loader"><span></span><b>메모 답변을 생성 중입니다</b></div></div>` : ""}
    ${state.notes.map((n) => renderMemoCard(n)).join("")}
  </div>`;
}

function renderMemoCard(n) {
  const thread = n.thread || [];
  const suggestions = n.suggestedQuestions?.length ? n.suggestedQuestions : ["더 쉽게 설명해줘", "예시 들어줘", "오해하기 쉬운 부분을 알려줘"];
  const inputValue = state.memoFollowInputs[n.id] || "";
  const loading = state.memoFollowLoading === n.id;
  const selected = String(n.selectedText || "").trim();
  const isSelectionNote = n.source === "selection" || (selected && selected !== "지문 전체 질문" && selected !== "지문 질문");
  const dateLabel = escapeHtml(new Date(n.createdAt || Date.now()).toLocaleString());
  const deleteButton = `<button class="btn tiny danger memo-delete-btn" data-delete-memo="${escapeHtml(n.id)}" title="메모 삭제">삭제</button>`;
  const head = `<div class="memo-head"><span class="badge">${dateLabel}</span>${!isSelectionNote ? `<span class="memo-source" title="${escapeHtml(selected || "지문 질문")}">${escapeHtml(shorten(selected || "지문 질문", 70))}</span>` : ""}${deleteButton}</div>`;
  const questionText = n.question || (isSelectionNote ? "이 선택 구절 자세히 설명해줘" : "메모");
  const questionBlock = isSelectionNote
    ? `<div class="memo-selected-box"><b>선택 구절</b><p>“${escapeHtml(selected || n.sourcePointer || "선택 구절") }”</p></div><p class="memo-question memo-question-under"><span class="memo-elbow">ㄴ</span>${escapeHtml(questionText)}</p>`
    : `${n.question ? `<p class="memo-question"><b>Q.</b> ${escapeHtml(n.question)}</p>` : ""}`;
  return `<div class="card memo-card ${isSelectionNote ? "selection-memo" : "reader-memo"}" data-note-id="${escapeHtml(n.id)}">
    ${head}
    ${questionBlock}
    <div class="memo-answer">${renderMarkdownText(n.explanation?.simple || n.answer || "")}</div>
    ${!isSelectionNote && n.sourcePointer ? `<p class="source-line"><b>관련 부분:</b> ${escapeHtml(n.sourcePointer)}</p>` : ""}
    ${thread.map((m) => `<div class="memo-thread"><p><b>Q.</b> ${escapeHtml(m.question)}</p><div class="memo-answer">${renderMarkdownText(m.answer)}</div>${m.sourcePointer ? `<p class="source-line"><b>관련 부분:</b> ${escapeHtml(m.sourcePointer)}</p>` : ""}</div>`).join("")}
    <div class="suggestion-row compact">${suggestions.slice(0, 4).map((q) => `<button class="suggestion-chip" data-memo-follow-quick="${escapeHtml(n.id)}" data-question="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("")}</div>
    <div class="inline-control memo-inline">
      <input class="input" data-memo-follow-input="${escapeHtml(n.id)}" value="${escapeHtml(inputValue)}" placeholder="이 메모에 대해 이어서 질문하기" />
      <button class="btn small" data-memo-follow-ask="${escapeHtml(n.id)}" ${loading ? "disabled" : ""}>${loading ? "답변 중..." : "질문"}</button>
    </div>
    ${loading ? `<div class="mini-loader"><span></span><b>이전 메모 맥락을 이어서 답변하고 있습니다</b></div>` : ""}
  </div>`;
}

function deleteMemo(noteId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  const label = note.question || note.selectedText || "이 메모";
  if (!confirm(`메모를 삭제할까요?\n\n${shorten(label, 80)}`)) return;
  state.notes = state.notes.filter((n) => n.id !== noteId);
  delete state.memoFollowInputs[noteId];
  if (state.memoFollowLoading === noteId) state.memoFollowLoading = null;
  notify("info", "메모 삭제 완료", "선택한 메모를 삭제했습니다.");
  render();
}

function renderSavedTab() {
  const records = state.records || [];
  return `<section class="saved-records-card standalone-card">
    <div class="saved-headline"><b>저장된 분석 노트</b><span>${records.length}개</span></div>
    ${records.length ? `<div class="saved-list">${records.map((r) => `<div class="card saved-item"><div><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(new Date(r.updatedAt || r.createdAt).toLocaleString())} · ${escapeHtml(r.field || "")}</p></div><div><button class="btn small" data-load-record="${r.id}">열기</button><button class="btn small danger" data-del-record="${r.id}">삭제</button></div></div>`).join("")}</div>` : `<div class="empty compact-empty">저장된 분석이 없습니다.</div>`}
  </section>`;
}

function renderCommentsTab() {
  return renderBotChatPanel();
}

function renderBotChatPanel() {
  const disabled = !state.analysis || state.botChatLoading;
  return `<section class="bot-chat-card standalone-card">
    <div class="bot-chat-head">
      <div><b>AI 댓글</b><span>지문을 던져 주면 댓글들이 제멋대로, 그래도 근거 있게 떠듭니다.</span></div>
      ${state.botChatLoading ? `<div class="tiny-loader"><span></span>댓글 쓰는 중</div>` : ""}
    </div>
    <div class="inline-control bot-input-line">
      <input class="input" id="botChatInput" value="${escapeHtml(state.botChatInput || "")}" placeholder="예: 이 지문에서 선지 함정이 될 부분 알려줘" ${!state.analysis ? "disabled" : ""} />
      <button class="btn small primary" id="botChatAskBtn" ${disabled ? "disabled" : ""}>질문</button>
    </div>
    ${!state.analysis ? `<p class="hint-line">지문 분석을 먼저 완료하면 AI 댓글을 사용할 수 있습니다.</p>` : `<p class="hint-line">AI 댓글은 메뉴의 저비용 모델을 사용합니다.</p>`}
    <div class="bot-thread-list">
      ${(state.botChatThreads || []).map((t) => renderBotThread(t)).join("") || `<div class="empty compact-empty">아직 댓글이 없습니다. 질문을 남기면 조그만 댓글창이 열립니다.</div>`}
    </div>
  </section>`;
}

function renderBotThread(thread) {
  return `<article class="bot-thread">
    <div class="bot-user-question"><b>Q.</b> ${escapeHtml(thread.question)}</div>
    <div class="bot-comment-list">${(thread.comments || []).map((c) => renderBotComment(c, thread.id, 0)).join("")}</div>
  </article>`;
}

function getBotAvatarSrc(comment = {}) {
  const raw = Number(comment.avatarId || 1);
  const id = Math.max(1, Math.min(CHAT_PROFILE_COUNT, Number.isFinite(raw) ? Math.round(raw) : 1));
  return `${CHAT_PROFILE_BASE}-${id}.${CHAT_PROFILE_EXT}`;
}

function renderBotAvatar(comment = {}) {
  const initial = escapeHtml(getBotInitial(comment.author));
  const src = escapeHtml(getBotAvatarSrc(comment));
  return `<div class="bot-avatar" data-avatar-id="${escapeHtml(comment.avatarId || 1)}">
    <img src="${src}" alt="" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';" />
    <span>${initial}</span>
  </div>`;
}

function renderBotComment(comment, threadId, depth = 0) {
  const key = `${threadId}:${comment.id}`;
  const open = !!state.botReplyOpen[key];
  const inputValue = state.botReplyInputs[key] || "";
  const loading = state.botReplyLoading === key;
  const replies = comment.replyThreads || [];
  const sideReplies = ensureArray(comment.sideReplies);
  return `<div class="bot-comment depth-${Math.min(depth, 2)}">
    ${renderBotAvatar(comment)}
    <div class="bot-bubble">
      <div class="bot-meta"><b>${escapeHtml(comment.author || "익명의 독자")}</b><time>${escapeHtml(comment.timeLabel || "방금 전")}</time></div>
      <p>${escapeHtml(comment.text || "음... 이건 지문을 한 번 더 붙잡아 봐야겠는데?")}</p>
      ${sideReplies.length ? `<div class="bot-side-replies">${sideReplies.map((r) => `<div class="bot-side-reply"><span>↳</span><b>${escapeHtml(r.author || "옆자리")}</b><em>${escapeHtml(r.text || "거기 아니고 이쪽인 듯.")}</em></div>`).join("")}</div>` : ""}
      <div class="bot-actions"><button class="bot-reply-btn" data-open-bot-reply="${escapeHtml(key)}">${open ? "닫기" : "답글로 질문"}</button></div>
      ${open ? `<div class="bot-reply-box">
        <input class="input" data-bot-reply-input="${escapeHtml(key)}" value="${escapeHtml(inputValue)}" placeholder="이 댓글에 대고 다시 물어보기" />
        <button class="btn tiny primary" data-bot-reply-ask="${escapeHtml(key)}" ${loading ? "disabled" : ""}>${loading ? "작성 중" : "질문"}</button>
      </div>` : ""}
      ${loading ? `<div class="mini-loader bot-mini-loader"><span></span><b>댓글들이 답글을 쓰는 중</b></div>` : ""}
      ${replies.map((rt) => `<div class="bot-reply-thread"><div class="bot-user-question small"><b>나</b> ${escapeHtml(rt.question)}</div>${(rt.comments || []).map((r) => renderBotComment(r, threadId, depth + 1)).join("")}</div>`).join("")}
    </div>
  </div>`;
}

function getBotInitial(name = "") {
  const clean = String(name || "AI").replace(/\s+/g, "").trim();
  return clean ? clean.slice(0, 1) : "A";
}

function renderMindmapPanel() {
  if (!state.analysis) return "";
  return `
    <section class="panel mindmap-panel">
      <div class="panel-head">
        <div class="panel-title">인터랙티브 마인드맵 <small>노드 드래그 · 빈 공간 이동 · 확대/축소 지원</small></div>
        <div class="mind-controls">
          <button class="btn small" id="mindZoomOutBtn" title="축소">−</button>
          <span class="zoom-label">${Math.round((state.mindZoom || 1) * 100)}%</span>
          <button class="btn small" id="mindZoomInBtn" title="확대">＋</button>
          <button class="btn small" id="resetMindBtn">배치 초기화</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="mindmap-wrap" id="mindmapWrap">
          <svg class="mindmap-svg" id="mindmapSvg" viewBox="0 0 1900 1200" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="mindmap-help">노드 드래그 · 빈 공간/휠클릭 드래그 이동 · 마우스 휠 확대/축소 · 터치 이동</div>
        </div>
      </div>
    </section>`;
}

function renderTooltip() {
  return `<div class="tooltip" id="tooltip"><div class="t-title"></div><div class="t-body"></div></div>`;
}

function renderDrawer() {
  const d = state.detail;
  return `
    <aside class="drawer ${d ? "show" : ""}" id="detailDrawer">
      <div class="drawer-head"><b>${escapeHtml(d?.title || "상세 설명")}</b><button class="btn small ghost" id="closeDrawer">닫기</button></div>
      <div class="drawer-body">${d ? `<p>${escapeHtml(d.body)}</p>${d.extra ? `<div class="notice" style="margin-top:10px">${escapeHtml(d.extra)}</div>` : ""}` : ""}</div>
    </aside>`;
}

function renderSideMenu() {
  return `
    <div class="side-overlay ${state.sideMenu ? "show" : ""}" id="sideOverlay"></div>
    <aside class="side-menu ${state.sideMenu ? "show" : ""}" id="sideMenu">
      <div class="side-head">
        <div><b>설정</b><p>API 키, 모델, 모드, 편의 기능</p></div>
        <button class="btn small ghost" id="closeSideMenu">×</button>
      </div>
      <div class="side-body">
        ${renderSettings()}
      </div>
    </aside>`;
}

function renderModelPicker() {
  if (!state.modelPickerTarget) return "";
  const targetLabel = state.modelPickerTarget === "reasoning" ? "전문 추론 모델" : state.modelPickerTarget === "grading" ? "저비용 모델" : "일반 분석 모델";
  return `
    <div class="modal-backdrop show" id="modelBackdrop"></div>
    <section class="model-picker show">
      <div class="drawer-head"><b>${targetLabel} 선택</b><button class="btn small ghost" id="closeModelPicker">닫기</button></div>
      <div class="model-list">
        ${MODEL_PRESETS.map((m) => `
          <button class="model-card" data-pick-model="${escapeHtml(m.id)}">
            <div>
              <b>${escapeHtml(m.label)}</b>
              <span>${escapeHtml(m.tag)}</span>
              <p>${escapeHtml(m.note)}</p>
            </div>
            <div class="price-pill">입력 ${escapeHtml(m.input)}<br>출력 ${escapeHtml(m.output)}</div>
          </button>`).join("")}
      </div>
      <div class="notice compact">가격은 앱 안의 참고용입니다. 실제 과금은 OpenAI 대시보드와 공식 Pricing 페이지 기준으로 확인해 주세요.</div>
    </section>`;
}


function getExportOptions() {
  const base = { ...createDefaultExportOptions(), ...(state.exportOptions || {}) };
  if (!base.passage) base.passageHighlights = false;
  if (!state.questions) {
    base.questions = false;
    base.includeSolutions = false;
  }
  if (!base.questions) base.includeSolutions = false;
  return base;
}

function renderExportModal() {
  if (!state.exportOpen) return "";
  const options = getExportOptions();
  const hasQuestions = !!state.questions;
  const hasNotes = ensureArray(state.notes).length > 0;
  const hasComments = ensureArray(state.botChatThreads).length > 0;
  const optionRows = [
    ["passage", "본문", "정돈된 지문 본문을 A4 중앙에 배치"],
    ["passageHighlights", "본문 형광펜·주석", "형광펜 구절 설명을 양옆 주석 카드로 배치", !options.passage],
    ["summary", "요약", "제목·난이도·요약·읽는 법"],
    ["structure", "구조", "전개 흐름·구조 타임라인·비교 대조"],
    ["concepts", "개념", "개념 사전·헷갈리는 문장"],
    ["questions", "문제", hasQuestions ? "5지선다·OX·서술형" : "문제 제작 후 선택 가능", !hasQuestions],
    ["includeSolutions", "해설 포함", "해설은 PDF 마지막 페이지에 따로 모음", !hasQuestions || !options.questions],
    ["notes", "메모", hasNotes ? "AI 메모와 이어진 질문" : "메모가 없으면 빈 섹션은 생략"],
    ["comments", "AI 댓글", hasComments ? "댓글 스레드와 답글" : "AI 댓글이 없으면 빈 섹션은 생략"]
  ];
  return `
    <div class="modal-backdrop show" id="exportBackdrop"></div>
    <section class="export-panel show">
      <div class="drawer-head"><b>내보내기</b><button class="btn small ghost" id="closeExportPanel">닫기</button></div>
      <div class="export-body">
        <div class="export-format-row">
          <button class="export-format-card pdf ${state.exportType === "pdf" ? "active" : ""}" data-export-type="pdf">
            <b>PDF로 내보내기</b><span>A4 인쇄용 레이아웃 · 추천</span>
          </button>
          <button class="export-format-card ${state.exportType === "markdown" ? "active" : ""}" data-export-type="markdown">
            <b>Markdown</b><span>공유·AI 어시스트용 컨텍스트</span>
          </button>
          <button class="export-format-card ${state.exportType === "text" ? "active" : ""}" data-export-type="text">
            <b>텍스트</b><span>가벼운 복사·보관용</span>
          </button>
        </div>
        <div class="export-option-grid">
          ${optionRows.map(([key, label, desc, disabled]) => `
            <label class="export-option ${disabled ? "disabled" : ""}">
              <input type="checkbox" data-export-option="${escapeHtml(key)}" ${options[key] ? "checked" : ""} ${disabled ? "disabled" : ""} />
              <span><b>${escapeHtml(label)}</b><em>${escapeHtml(desc)}</em></span>
            </label>`).join("")}
        </div>
        <div class="export-note">
          PDF는 새 인쇄 창을 열어 브라우저의 <b>PDF로 저장</b> 기능을 사용합니다. 배경 그래픽이 보이지 않으면 인쇄 설정에서 배경 그래픽을 켜 주세요.
        </div>
        <div class="export-actions">
          <button class="btn ghost" id="cancelExportBtn">취소</button>
          <button class="btn primary export-main-btn" id="runExportBtn">${escapeHtml(EXPORT_TYPE_LABELS[state.exportType] || "PDF")} 내보내기</button>
        </div>
      </div>
    </section>`;
}

function attachExportEvents() {
  document.querySelector("#closeExportPanel")?.addEventListener("click", () => { state.exportOpen = false; render(); });
  document.querySelector("#cancelExportBtn")?.addEventListener("click", () => { state.exportOpen = false; render(); });
  document.querySelector("#exportBackdrop")?.addEventListener("click", () => { state.exportOpen = false; render(); });
  document.querySelectorAll("[data-export-type]").forEach((el) => el.addEventListener("click", () => {
    state.exportType = el.dataset.exportType || "pdf";
    render();
  }));
  document.querySelectorAll("[data-export-option]").forEach((el) => el.addEventListener("change", () => {
    const key = el.dataset.exportOption;
    state.exportOptions = { ...createDefaultExportOptions(), ...(state.exportOptions || {}), [key]: el.checked };
    if (key === "passage" && !el.checked) state.exportOptions.passageHighlights = false;
    if (key === "questions" && !el.checked) state.exportOptions.includeSolutions = false;
    render();
  }));
  document.querySelector("#runExportBtn")?.addEventListener("click", runExport);
}

function runExport() {
  if (!state.analysis) return notify("info", "내보낼 분석이 없습니다", "먼저 지문 분석을 완료해 주세요.");
  const options = getExportOptions();
  const filenameBase = makeExportFileBaseName();
  try {
    if (state.exportType === "markdown") {
      downloadTextFile(`${filenameBase}.md`, buildMarkdownExport(options), "text/markdown;charset=utf-8");
      notify("success", "Markdown 내보내기 완료", "공유용 마크다운 파일을 다운로드했습니다.");
      state.exportOpen = false;
      render();
    } else if (state.exportType === "text") {
      downloadTextFile(`${filenameBase}.txt`, buildTextExport(options), "text/plain;charset=utf-8");
      notify("success", "텍스트 내보내기 완료", "TXT 파일을 다운로드했습니다.");
      state.exportOpen = false;
      render();
    } else {
      state.exportOpen = false;
      render();
      openPdfPrintWindow(options, `${filenameBase}.html`);
      notify("info", "PDF 인쇄 화면을 준비했습니다", "인쇄 대상에서 'PDF로 저장'을 선택해 주세요. 모바일에서는 인쇄 전용 탭이 열릴 수 있습니다.");
    }
  } catch (error) {
    notify("error", "내보내기 실패", error.message || "내보내기 중 오류가 발생했습니다.", error.stack || String(error));
  }
}

function makeExportFileBaseName() {
  const title = String(state.analysis?.title || "반짝국어_분석").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, "_").slice(0, 42) || "반짝국어_분석";
  const date = new Date().toISOString().slice(0, 10);
  return `${title}_${date}`;
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isLikelyMobilePrintDevice() {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser|KAKAOTALK|NAVER/i.test(ua) || window.matchMedia?.("(max-width: 760px)")?.matches;
}

function openPdfPrintWindow(options, fallbackFilename = "반짝국어_분석.html") {
  const html = buildPdfHtml(options);
  // 모바일 브라우저는 숨겨진 iframe 인쇄를 무시하고 현재 사이트 화면을 인쇄하는 경우가 많습니다.
  // 그래서 모바일에서는 보이는 인쇄 전용 문서를 새 탭으로 열어 그 문서 자체를 PDF 저장 대상으로 만듭니다.
  if (isLikelyMobilePrintDevice()) {
    openPdfFallbackWindow(html, fallbackFilename, null, { mobile: true });
    return;
  }
  const frame = document.createElement("iframe");
  frame.title = "반짝국어 PDF 인쇄";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none"
  });

  let printed = false;
  const cleanup = () => window.setTimeout(() => frame.remove(), 1800);
  const printFrame = () => {
    if (printed) return;
    printed = true;
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      cleanup();
    } catch (error) {
      frame.remove();
      openPdfFallbackWindow(html, fallbackFilename, error);
    }
  };

  try {
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) throw new Error("인쇄 프레임을 만들 수 없습니다.");
    doc.open();
    doc.write(html);
    doc.close();
    frame.addEventListener("load", () => window.setTimeout(printFrame, 250), { once: true });
    window.setTimeout(printFrame, 900);
  } catch (error) {
    frame.remove();
    openPdfFallbackWindow(html, fallbackFilename, error);
  }
}

function openPdfFallbackWindow(html, fallbackFilename, originalError, options = {}) {
  const win = window.open("", "_blank", "width=980,height=1200");
  if (!win) {
    downloadTextFile(fallbackFilename, html, "text/html;charset=utf-8");
    throw new Error(`브라우저가 인쇄 창을 막아 HTML 파일로 저장했습니다. 다운로드된 파일을 열고 Ctrl+P로 PDF 저장을 선택해 주세요. (${originalError?.message || "팝업 차단"})`);
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  const delayMs = options.mobile ? 900 : 500;
  const tryPrint = () => window.setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* 모바일 브라우저에서는 상단 버튼으로 다시 인쇄할 수 있습니다. */ }
  }, delayMs);
  if (win.document.readyState === "complete") tryPrint();
  else win.addEventListener("load", tryPrint, { once: true });
}

function buildPdfHtml(options) {
  const title = state.analysis?.title || "반짝국어 분석";
  const flowSections = [];
  if (options.summary) flowSections.push(renderExportSummaryHtml());
  if (options.structure) flowSections.push(renderExportStructureHtml());
  if (options.concepts) flowSections.push(renderExportConceptsHtml());
  if (options.notes) flowSections.push(renderExportNotesHtml());
  if (options.comments) flowSections.push(renderExportCommentsHtml());

  const sections = [];
  sections.push(renderExportCoverHtml());
  if (options.passage) sections.push(renderExportPassageHtml(options));
  if (flowSections.length) sections.push(`<main class="export-flow-page">${flowSections.join("\n")}</main>`);
  if (options.questions && state.questions) sections.push(renderExportQuestionsHtml(false));
  if (options.questions && options.includeSolutions && state.questions) sections.push(renderExportQuestionsHtml(true));
  const toolbar = `<div class="print-toolbar no-print"><b>반짝국어 PDF 내보내기</b><span>모바일에서 사이트 화면이 저장되면 이 인쇄 전용 페이지의 버튼을 눌러 다시 PDF로 저장하세요.</span><button onclick="window.print()">PDF로 저장/인쇄</button></div>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${buildPdfStyles()}</style></head><body>${toolbar}${sections.join("\\n")}<script>window.addEventListener('afterprint',()=>{});<\/script></body></html>`;
}

function buildPdfStyles() {
  return `
    @page { size: A4; margin: 18mm 11mm 15mm; @bottom-center { content: counter(page); color: #8b95aa; font-size: 8pt; font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif; } }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif; background: linear-gradient(135deg, #f8fbff 0%, #f5f3ff 45%, #eefcff 100%); font-size: 10pt; line-height: 1.5; }
    .print-toolbar { position: sticky; top: 0; z-index: 20; display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(255,255,255,.96); border-bottom:1px solid rgba(118,129,152,.22); box-shadow:0 10px 24px rgba(31,42,68,.12); font-size:13px; }
    .print-toolbar b { color:#4f46e5; }
    .print-toolbar span { flex:1; color:#65718b; }
    .print-toolbar button { border:0; border-radius:999px; padding:9px 14px; color:#fff; font-weight:800; background:linear-gradient(135deg,#4f46e5,#06b6d4); }
    .export-page, .export-flow-page { position: relative; padding: 12mm 9mm 13mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; background: linear-gradient(135deg, rgba(255,255,255,.97), rgba(246,250,255,.95)); border: 1px solid rgba(124, 137, 171, .16); overflow: visible; }
    .export-page::before, .export-flow-page::before { content: ""; position: absolute; inset: -26mm auto auto -30mm; width: 80mm; height: 80mm; border-radius: 999px; background: radial-gradient(circle, rgba(129,140,248,.12), transparent 65%); pointer-events: none; }
    .cover, .passage-page, .question-page, .solution-page { min-height: 255mm; break-after: page; page-break-after: always; }
    .export-flow-page { min-height: 255mm; break-after: page; page-break-after: always; }
    .cover { display:flex; flex-direction:column; justify-content:center; }
    .cover h1 { font-size: 24pt; line-height: 1.18; margin: 0 0 7px; letter-spacing: -.05em; }
    .cover .brand { display:inline-flex; width:max-content; padding:4px 9px; border-radius:999px; color:#4f46e5; border:1px solid rgba(79,70,229,.18); background:rgba(255,255,255,.72); font-size: 9pt; }
    .cover p { max-width: 150mm; color:#4b5870; font-size: 10pt; line-height:1.7; }
    .meta-grid { display:grid; grid-template-columns: repeat(3,1fr); gap: 6mm; margin-top: 10mm; }
    .meta, .card { border:1px solid rgba(118,129,152,.18); background:rgba(255,255,255,.78); border-radius:10px; padding:5mm; box-shadow: 0 5px 18px rgba(41,53,87,.05); break-inside: avoid; page-break-inside: avoid; }
    .meta b, .meta span { display:block; }
    .meta b { color:#64708a; font-size:8pt; }
    .section-title { display:flex; justify-content:space-between; align-items:end; gap:8px; border-bottom: 1px solid rgba(99,102,241,.2); margin: 0 0 5mm; padding-bottom:2mm; break-after: avoid; page-break-after: avoid; }
    .section-title h2 { margin:0; font-size: 15pt; letter-spacing:-.04em; }
    .section-title span { color:#7b8498; font-size:8pt; }
    .export-section-block { position:relative; z-index:1; margin: 0 0 7mm; break-inside: auto; }
    .export-section-block .card { margin: 0 0 4mm; padding: 4mm; }
    .card h3 { margin: 0 0 2mm; font-size: 11pt; }
    .card h4 { margin: 0 0 1.5mm; font-size: 10pt; }
    p { margin: 0 0 2mm; }
    small { color:#68758d; font-size:8pt; }
    .grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:4mm; }
    .flow { display:flex; flex-wrap:wrap; gap:2mm; align-items:center; }
    .pill, .badge { display:inline-flex; border-radius:999px; padding:1.2mm 2.2mm; background:rgba(99,102,241,.08); color:#4f46e5; font-size:8pt; font-weight:700; margin-right:1mm; }
    .arrow { color:#a7afbf; margin:0 1mm; }
    .passage-page .section-title { margin-bottom: 4mm; }
    .export-passage-stack { position:relative; z-index:1; display:block; }
    .export-passage-block { margin: 0 0 5mm; break-inside: auto; page-break-inside: auto; }
    .passage-text { font-size: 10.3pt; line-height: 1.78; background:rgba(255,255,255,.86); border-radius:10px; padding:3.5mm 4mm; border:1px solid rgba(118,129,152,.14); margin:0 0 2.2mm; }
    .passage-para { margin: 0; break-inside: auto; page-break-inside: auto; }
    .passage-text mark { border-radius:4px; padding:0 .55mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
    .passage-note-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:1.8mm; align-items:start; margin:0 0 2mm; }
    .passage-note-grid.empty { display:block; }
    mark.claim, .margin-note.claim em { background:#fff3a3; }
    mark.evidence, .margin-note.evidence em { background:#c8f7dc; }
    mark.contrast, .margin-note.contrast em { background:#d9d2ff; }
    mark.definition, .margin-note.definition em { background:#cbe7ff; }
    mark.example, .margin-note.example em { background:#ffd9b3; }
    mark.warning, .margin-note.warning em { background:#ffd0d0; }
    mark.support, .margin-note.support em { background:#e8ecf4; }
    .margin-note { font-size:7.2pt; line-height:1.22; border:1px solid rgba(118,129,152,.17); border-radius:7px; background:rgba(255,255,255,.78); padding:1.55mm; margin:0; break-inside: avoid; page-break-inside: avoid; }
    .margin-note em { display:inline; font-style:normal; font-weight:800; color:#38425a; border-radius:4px; padding:.22mm .8mm; }
    .margin-note b { display:block; margin:.8mm 0 .55mm; color:#1f2a44; font-size:7.45pt; }
    .question-page, .solution-page { padding-top: 10mm; }
    .question-item { border:1px solid rgba(118,129,152,.16); background:rgba(255,255,255,.82); border-radius:10px; padding:4mm; margin-bottom:4mm; break-inside: avoid; page-break-inside: avoid; }
    .export-view-box { margin:2.2mm 0 3mm; padding:3mm 3.5mm; border-radius:9px; border:1px solid rgba(99,102,241,.18); background:rgba(99,102,241,.065); break-inside: avoid; page-break-inside: avoid; }
    .export-view-box b { display:inline-flex; margin-bottom:1.2mm; color:#4f46e5; font-size:8.5pt; }
    .export-view-box p { margin:0; line-height:1.55; white-space:pre-wrap; }
    .choice { margin-left: 5mm; }
    .solution-list { margin: 0; padding: 0; }
    .solution-line { list-style:none; border-bottom:1px solid rgba(118,129,152,.18); padding:2.4mm 0; margin:0; break-inside: avoid; page-break-inside: avoid; }
    .solution-line h3 { display:inline; margin:0; font-size:9.8pt; }
    .solution-line p { margin:1mm 0 0; }
    .memo-export-item { border:1px solid rgba(118,129,152,.16); background:rgba(255,255,255,.82); border-radius:10px; padding:4mm; margin-bottom:4mm; break-inside: avoid; page-break-inside: avoid; }
    .memo-head { display:flex; align-items:center; justify-content:space-between; gap:4mm; margin-bottom:2.5mm; }
    .memo-source { color:#65718b; font-size:8pt; max-width: 105mm; text-align:right; }
    .memo-selected-box { border:1px solid rgba(99,102,241,.18); background:linear-gradient(135deg, rgba(99,102,241,.10), rgba(14,165,233,.06)); border-radius:10px; padding:3mm 3.5mm; margin:0 0 2mm; }
    .memo-selected-box b { display:block; color:#4f46e5; font-size:8pt; margin-bottom:1mm; }
    .memo-selected-box p { margin:0; font-size:10.2pt; line-height:1.55; color:#1f2a44; }
    .memo-question { background:rgba(99,102,241,.08); border-radius:8px; padding:2.5mm 3mm; margin:0 0 3mm; font-size:11pt; }
    .memo-question-under { display:flex; align-items:flex-start; gap:2mm; background:transparent; padding:0 0 2.5mm 1mm; font-size:10.2pt; color:#29344f; }
    .memo-elbow { color:#4f46e5; font-weight:900; }
    .memo-answer { font-size:10pt; line-height:1.65; }
    .memo-inline-mark, .memo-emphasis { color:#4f46e5; font-weight:800; background:rgba(99,102,241,.11); border-radius:4px; padding:0 .7mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
    .comment { border-left:3px solid rgba(99,102,241,.32); padding:2mm 0 2mm 3mm; margin:2mm 0; break-inside: avoid; }
    .muted { color:#68758d; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print, .print-toolbar { display:none !important; } .export-page, .export-flow-page { border:0; } }
  `;
}

function renderExportCoverHtml() {
  const a = state.analysis || {};
  const score = a.difficulty?.score ? String(a.difficulty.score).replace(/\.0$/, "") : "";
  return `<section class="export-page cover"><div class="brand">반짝국어 분석 리포트</div><h1>${escapeHtml(a.title || "국어 지문 분석")}</h1><p>${escapeHtml(a.overallSummary || "분석 요약이 없습니다.")}</p><div class="meta-grid"><div class="meta"><b>분야</b><span>${escapeHtml(a.field || "-")}</span></div><div class="meta"><b>난이도</b><span>${escapeHtml(a.difficulty?.level || "-")} ${score ? `· ${score}/5` : ""}</span></div><div class="meta"><b>내보내기</b><span>PDF 학습 자료</span></div></div></section>`;
}

function exportBlock(title, subtitle, body, cls = "") {
  return `<section class="export-section-block ${cls}"><div class="section-title"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle || "")}</span></div>${body}</section>`;
}

function exportPage(title, subtitle, body, cls = "") {
  return `<section class="export-page ${cls}"><div class="section-title"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(subtitle || "")}</span></div>${body}</section>`;
}

function getPassageParagraphs() {
  const source = String(state.passage || state.analysis?.cleanedPassage || "").trim();
  if (!source) return [];
  return source.split(/\n\s*\n/g).map((text, i) => ({ id: state.analysis?.paragraphs?.[i]?.id || `p${i + 1}`, index: i + 1, text: text.trim() })).filter((p) => p.text);
}

function renderExportPassageHtml(options) {
  const paragraphs = getPassageParagraphs();
  const highlights = options.passageHighlights ? ensureArray(state.analysis?.highlights) : [];
  if (!paragraphs.length) return exportPage("본문", "본문만", `<div class="card">본문이 없습니다.</div>`, "passage-page");
  const blocks = paragraphs.map((p) => {
    const related = highlights.filter((h) => h.paragraphId === p.id || p.text.includes(h.text));
    const noteHtml = related.length
      ? related.slice(0, 16).map(renderMarginNoteHtml).join("")
      : options.passageHighlights
        ? `<div class="margin-note support"><em>주석 없음</em><b>${p.index}문단</b>이 문단에 연결된 형광펜 설명이 없습니다.</div>`
        : "";
    return `<section class="export-passage-block"><article class="passage-text"><p class="passage-para"><span class="badge">${p.index}문단</span>${highlightTextForExport(p.text, related)}</p></article>${options.passageHighlights ? `<div class="passage-note-grid ${related.length ? "" : "empty"}">${noteHtml}</div>` : ""}</section>`;
  }).join("");
  const body = `<div class="export-passage-stack">${blocks}</div>`;
  return exportPage("본문", options.passageHighlights ? "문단별 본문·형광펜 주석" : "본문만", body, "passage-page");
}

function renderMarginNoteHtml(h) {
  return `<div class="margin-note ${escapeHtml(h.color || "claim")}"><em>${escapeHtml(HIGHLIGHT_LABELS[h.color] || h.type || "핵심")}</em><b>${escapeHtml(h.text || "")}</b>${escapeHtml(h.detail || h.shortReason || "")}</div>`;
}

function highlightTextForExport(text, highlights) {
  let html = escapeHtml(text);
  const sorted = ensureArray(highlights).filter((h) => h.text).sort((a, b) => String(b.text).length - String(a.text).length).slice(0, 28);
  for (const h of sorted) {
    const needle = escapeHtml(h.text);
    if (!needle || !html.includes(needle)) continue;
    html = html.replace(needle, `<mark class="${escapeHtml(h.color || "claim")}">${needle}</mark>`);
  }
  return html.replaceAll("\n", "<br>");
}

function renderExportSummaryHtml() {
  const a = state.analysis || {};
  const criteria = ensureArray(a.difficulty?.criteria);
  const body = `<div class="card"><h3>${escapeHtml(a.title || "제목 없음")}</h3><p>${escapeHtml(a.overallSummary || "")}</p></div><div class="card"><h3>읽는 법</h3><p>${escapeHtml(a.readingGuide || "")}</p></div><div class="grid">${criteria.map((c) => `<div class="card"><h4>${escapeHtml(c.name)}</h4><p><b>${escapeHtml(String(c.score || "-"))}/5</b> ${escapeHtml(c.reason || "")}</p></div>`).join("")}</div><div class="card"><h3>문단별 요약</h3>${ensureArray(a.paragraphs).map((p) => `<p><span class="pill">${escapeHtml(String(p.index || ""))}문단 · ${escapeHtml(p.role || "")}</span> ${escapeHtml(p.summary || "")}</p>`).join("")}</div>`;
  return exportBlock("요약", "제목·난이도·문단 요약", body);
}

function renderExportStructureHtml() {
  const a = state.analysis || {};
  const body = `<div class="card"><h3>전개 흐름</h3><div class="flow">${ensureArray(a.flow).map((f, i, arr) => `<span class="pill">${escapeHtml(f)}</span>${i < arr.length - 1 ? `<span class="arrow">→</span>` : ""}`).join("")}</div></div><div class="card"><h3>구조 타임라인</h3>${ensureArray(a.structureTimeline).map((t, i) => `<p><span class="pill">${i + 1}</span><b>${escapeHtml(t.label || "")}</b> ${escapeHtml(t.description || "")}</p>`).join("")}</div><div class="card"><h3>비교·대조</h3>${ensureArray(a.comparisons).map((c) => `<p><b>${escapeHtml(c.axis || "비교")}</b> · ${escapeHtml(c.a || "A")} ↔ ${escapeHtml(c.b || "B")}<br>${escapeHtml(c.meaning || "")} ${c.sourceDetail ? `<br><small>${escapeHtml(c.sourceDetail)}</small>` : ""}</p>`).join("") || `<p>비교·대조 항목이 없습니다.</p>`}</div>`;
  return exportBlock("구조", "흐름·타임라인·비교 대조", body);
}

function renderExportConceptsHtml() {
  const a = state.analysis || {};
  const body = `<div class="card"><h3>개념 사전</h3>${ensureArray(a.glossary).map((g) => `<p><b>${escapeHtml(g.term || "개념")}</b> - ${escapeHtml(g.meaning || "")}<br><small>지문 속 의미: ${escapeHtml(g.inTextMeaning || "")} ${g.sourceText ? `· ${escapeHtml(g.sourceText)}` : ""}</small></p>`).join("") || `<p>개념 항목이 없습니다.</p>`}</div><div class="card"><h3>헷갈리는 문장</h3>${ensureArray(a.trickySentences).map((t) => `<p><b>${escapeHtml(t.sentence || "")}</b><br>${escapeHtml(t.easyRewrite || "")}<br><small>${escapeHtml(t.testPoint || "")}</small></p>`).join("") || `<p>헷갈리는 문장 항목이 없습니다.</p>`}</div>`;
  return exportBlock("개념", "개념 사전·헷갈리는 문장", body);
}

function renderExportQuestionViewBox(item) {
  const view = cleanViewBox(item?.viewBox || "");
  if (!view) return "";
  return `<div class="export-view-box"><b>&lt;보기&gt;</b><p>${escapeHtml(view)}</p></div>`;
}

function renderExportQuestionsHtml(answersOnly = false) {
  const q = state.questions || {};
  const title = answersOnly ? "문제 해설" : "문제";
  if (answersOnly) {
    const body = `<ol class="solution-list">${[
      ...ensureArray(q.multipleChoice).map((item, i) => `<li class="solution-line"><h3>5지선다 ${i + 1}</h3><p><b>정답</b> ${normalizeChoiceNumber(item.answer)} · ${escapeHtml(item.finalExplanation || "")}</p><p><small>출제 의도: ${escapeHtml(item.sourceIntent || "")}</small></p></li>`),
      ...ensureArray(q.ox).map((item, i) => `<li class="solution-line"><h3>OX ${i + 1}</h3><p><b>정오</b> ${escapeHtml(item.answer || "")} · ${escapeHtml(item.explanation || "")}</p><p><small>함정: ${escapeHtml(item.trap || "")}</small></p></li>`),
      ...ensureArray(q.shortAnswer).map((item, i) => `<li class="solution-line"><h3>서술형 ${i + 1}</h3><p><b>모범 답안</b> ${escapeHtml(item.idealAnswer || "")}</p><p><small>출제 의도: ${escapeHtml(item.type || "")}</small></p><p><small>채점 요소: ${ensureArray(item.gradingPoints).map(escapeHtml).join(" · ")}</small></p></li>`)
    ].join("")}</ol>` || `<div class="card">해설이 없습니다.</div>`;
    return exportPage(title, "정답·출제 의도·해설", body, "solution-page");
  }
  const body = [
    ...ensureArray(q.multipleChoice).map((item, i) => `<div class="question-item"><h3>5지선다 ${i + 1}. ${escapeHtml(item.question || "")}</h3>${renderExportQuestionViewBox(item)}${ensureArray(item.choices).map((c) => `<p class="choice">${normalizeChoiceNumber(c.number)} ${escapeHtml(c.text || "")}</p>`).join("")}</div>`),
    ...ensureArray(q.ox).map((item, i) => `<div class="question-item"><h3>OX ${i + 1}. ${escapeHtml(item.statement || "")}</h3><p class="muted">O / X</p></div>`),
    ...ensureArray(q.shortAnswer).map((item, i) => `<div class="question-item"><h3>서술형 ${i + 1}. ${escapeHtml(item.question || "")}</h3><p class="muted">답안:</p></div>`)
  ].join("") || `<div class="card">문제가 없습니다.</div>`;
  return exportPage(title, "문항만", body, "question-page");
}

function formatExportMemoText(value = "") {
  const raw = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!raw) return "";
  return raw
    .split(/\n{2,}/g)
    .map((block) => escapeHtml(block.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
      .replace(/\*\*([^*]{1,280})\*\*/g, '<strong class="memo-inline-mark">$1</strong>')
      .replace(/__([^_]{1,280})__/g, '<strong class="memo-inline-mark">$1</strong>')
      .replace(/`([^`]{1,160})`/g, '<code>$1</code>'))
    .filter(Boolean)
    .join("<br>");
}

function renderExportNotesHtml() {
  const notes = ensureArray(state.notes);
  const body = notes.length ? notes.map((n) => {
    const selected = String(n.selectedText || "").trim();
    const isSelectionNote = n.source === "selection" || (selected && selected !== "지문 전체 질문" && selected !== "지문 질문");
    const question = n.question || (isSelectionNote ? "이 선택 구절 자세히 설명해줘" : "메모");
    const source = selected || n.sourcePointer || "지문 전체 질문";
    const answer = n.explanation?.simple || n.explanation?.answer || n.answer || "";
    const threadHtml = ensureArray(n.thread).map((t) => `<p><b>추가 질문</b> ${escapeHtml(t.question || "")}<br>${formatExportMemoText(t.answer || "")}</p>`).join("");
    const head = `<div class="memo-head"><span class="badge">${escapeHtml(new Date(n.createdAt || Date.now()).toLocaleString())}</span>${!isSelectionNote ? `<span class="memo-source">${escapeHtml(shorten(source, 96))}</span>` : ""}</div>`;
    const questionHtml = isSelectionNote
      ? `<div class="memo-selected-box"><b>선택 구절</b><p>“${escapeHtml(source)}”</p></div><p class="memo-question memo-question-under"><span class="memo-elbow">ㄴ</span>${escapeHtml(question)}</p>`
      : `<h3 class="memo-question">Q. ${escapeHtml(question)}</h3>`;
    return `<div class="memo-export-item">${head}${questionHtml}<p class="memo-answer">${formatExportMemoText(answer)}</p>${threadHtml}</div>`;
  }).join("") : `<div class="card">저장된 메모가 없습니다.</div>`;
  return exportBlock("메모", "선택 구절 설명·추가 질문", body);
}

function renderExportCommentsHtml() {
  const threads = ensureArray(state.botChatThreads);
  const body = threads.length ? threads.map((t) => `<div class="card"><h3>Q. ${escapeHtml(t.question || "")}</h3>${ensureArray(t.comments).map((c) => `<div class="comment"><b>${escapeHtml(c.author || "익명")}</b> <small>${escapeHtml(c.timeLabel || "방금 전")}</small><p>${escapeHtml(c.text || "")}</p>${ensureArray(c.sideReplies).map((r) => `<p class="muted">↳ ${escapeHtml(r.author || "익명")}: ${escapeHtml(r.text || "")}</p>`).join("")}</div>`).join("")}</div>`).join("") : `<div class="card">AI 댓글 스레드가 없습니다.</div>`;
  return exportBlock("AI 댓글", "질문 스레드·답글", body);
}

function memoToMarkdown(n) {
  const selected = String(n.selectedText || "").trim();
  const isSelectionNote = n.source === "selection" || (selected && selected !== "지문 전체 질문" && selected !== "지문 질문");
  const source = selected || n.sourcePointer || "지문 전체 질문";
  const question = n.question || (isSelectionNote ? "이 선택 구절 자세히 설명해줘" : "메모");
  const answer = n.explanation?.simple || n.explanation?.answer || n.answer || "";
  const thread = ensureArray(n.thread).map((m) => `- 추가 질문: ${mdEscape(m.question)}\n  - 답변: ${mdEscape(m.answer)}`).join("\n");
  if (isSelectionNote) {
    return `### 선택 구절 메모\n- 선택 구절: ${mdEscape(source)}\n- ㄴ 질문: ${mdEscape(question)}\n\n${mdEscape(answer)}${thread ? `\n\n${thread}` : ""}`;
  }
  return `### ${mdEscape(question)}\n- 관련 부분: ${mdEscape(source)}\n\n${mdEscape(answer)}${thread ? `\n\n${thread}` : ""}`;
}


function buildMarkdownExport(options) {
  const a = state.analysis || {};
  const parts = [`# ${mdEscape(a.title || "반짝국어 분석")}`, ``, `> 반짝국어 공유용 마크다운입니다. 다른 AI 어시스트가 문맥을 잃지 않도록 원문, 분석 요약, 구조, 개념, 문제, 메모, AI 댓글을 선택한 범위만큼 포함합니다.`, ``, `- 분야: ${mdEscape(a.field || "")}`, `- 난이도: ${mdEscape(a.difficulty?.level || "")} ${mdEscape(a.difficulty?.score ?? "")}/5`, `- 생성일: ${new Date().toLocaleString()}`];
  if (options.passage) parts.push(`\n## 본문\n\n${mdEscape(state.passage || a.cleanedPassage || "")}`);
  if (options.summary) parts.push(`\n## 요약\n\n${mdEscape(a.overallSummary || "")}\n\n### 읽는 법\n${mdEscape(a.readingGuide || "")}\n\n### 문단별 요약\n${ensureArray(a.paragraphs).map((p) => `- ${p.index}문단(${mdEscape(p.role)}): ${mdEscape(p.summary)} / 핵심: ${mdEscape(p.coreClaim)}`).join("\n")}`);
  if (options.structure) parts.push(`\n## 구조\n\n### 흐름\n${bulletLines(a.flow)}\n\n### 구조 타임라인\n${ensureArray(a.structureTimeline).map((t) => `- ${mdEscape(t.label)}: ${mdEscape(t.description)}`).join("\n")}\n\n### 비교·대조\n${ensureArray(a.comparisons).map((c) => `- ${mdEscape(c.axis)}: ${mdEscape(c.a)} ↔ ${mdEscape(c.b)} - ${mdEscape(c.meaning)} (${mdEscape(c.sourceDetail)})`).join("\n")}`);
  if (options.concepts) parts.push(`\n## 개념\n\n${ensureArray(a.glossary).map((g) => `### ${mdEscape(g.term)}\n- 뜻: ${mdEscape(g.meaning)}\n- 지문 속 의미: ${mdEscape(g.inTextMeaning)}\n- 출처: ${mdEscape(g.sourceText)}`).join("\n\n")}\n\n## 헷갈리는 문장\n${ensureArray(a.trickySentences).map((t) => `- ${mdEscape(t.sentence)}\n  - 쉽게: ${mdEscape(t.easyRewrite)}\n  - 포인트: ${mdEscape(t.testPoint)}`).join("\n")}`);
  if (options.questions && state.questions) parts.push(buildQuestionsMarkdown(options.includeSolutions));
  if (options.notes) parts.push(`\n## 메모\n\n${ensureArray(state.notes).map(memoToMarkdown).join("\n\n")}`);
  if (options.comments) parts.push(`\n## AI 댓글\n\n${ensureArray(state.botChatThreads).map((t) => `### Q. ${mdEscape(t.question)}\n${ensureArray(t.comments).map(commentToMarkdown).join("\n")}`).join("\n\n")}`);
  return parts.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

function buildQuestionsMarkdown(includeSolutions) {
  const q = state.questions || {};
  const parts = [`
## 문제`];
  ensureArray(q.multipleChoice).forEach((item, i) => {
    const view = cleanViewBox(item.viewBox || "");
    const viewBlock = view ? `

<보기>
${mdEscape(view)}` : "";
    parts.push(`
### 5지선다 ${i + 1}
${mdEscape(item.question)}${viewBlock}
${ensureArray(item.choices).map((c) => `${normalizeChoiceNumber(c.number)} ${mdEscape(c.text)}`).join("\n")}`);
    if (includeSolutions) parts.push(`정답: ${normalizeChoiceNumber(item.answer)}
출제 의도: ${mdEscape(item.sourceIntent)}
해설: ${mdEscape(item.finalExplanation)}`);
  });
  ensureArray(q.ox).forEach((item, i) => { parts.push(`
### OX ${i + 1}
${mdEscape(item.statement)}`); if (includeSolutions) parts.push(`정오: ${mdEscape(item.answer)}
출제 의도: ${mdEscape(item.trap)}
해설: ${mdEscape(item.explanation)}`); });
  ensureArray(q.shortAnswer).forEach((item, i) => { parts.push(`
### 서술형 ${i + 1}
${mdEscape(item.question)}`); if (includeSolutions) parts.push(`출제 의도: ${mdEscape(item.type)}
모범 답안: ${mdEscape(item.idealAnswer)}
채점 요소:
${bulletLines(item.gradingPoints)}`); });
  return parts.join("\n");
}

function commentToMarkdown(c) {
  const side = ensureArray(c.sideReplies).map((r) => `  - ↳ ${mdEscape(r.author)}: ${mdEscape(r.text)}`).join("\n");
  const replies = ensureArray(c.replyThreads).map((rt) => `  - 나: ${mdEscape(rt.question)}\n${ensureArray(rt.comments).map((rc) => `    - ${mdEscape(rc.author)}: ${mdEscape(rc.text)}`).join("\n")}`).join("\n");
  return `- ${mdEscape(c.author || "익명")}(${mdEscape(c.timeLabel || "방금 전")}): ${mdEscape(c.text || "")}\n${[side, replies].filter(Boolean).join("\n")}`;
}

function buildTextExport(options) {
  return buildMarkdownExport(options).replace(/^#+\s*/gm, "").replace(/[*_`>#]/g, "").replace(/\n{3,}/g, "\n\n");
}

function renderLogPanel() {
  if (!state.logOpen) return "";
  return `
    <div class="modal-backdrop show" id="logBackdrop"></div>
    <section class="log-panel show">
      <div class="drawer-head"><b>오류 로그</b><button class="btn small ghost" id="closeLogPanel">닫기</button></div>
      <div class="log-list">
        ${state.logs.length ? state.logs.map((l) => `<div class="log-item"><b>${escapeHtml(l.title)}</b><p>${escapeHtml(l.message)}</p><pre>${escapeHtml(l.details || "세부 로그 없음")}</pre></div>`).join("") : `<div class="empty">아직 오류 로그가 없습니다.</div>`}
      </div>
    </section>`;
}

function attachIntroEvents() {
  document.querySelector("#startBtn")?.addEventListener("click", () => {
    state.started = true;
    render();
  });
  document.querySelector("#demoStartBtn")?.addEventListener("click", () => {
    state.started = true;
    state.passage = SAMPLE_PASSAGE;
    state.analysis = createDemoAnalysis(SAMPLE_PASSAGE);
    state.tab = "summary";
    render();
  });
  document.querySelector("#themeIntroBtn")?.addEventListener("click", toggleTheme);
}

function attachAppEvents() {
  document.querySelector("#themeBtn")?.addEventListener("click", toggleTheme);
  document.querySelector("#resetBtn")?.addEventListener("click", () => {
    state.started = false;
    state.analysis = null;
    state.questions = null;
    state.notes = [];
    state.detail = null;
    state.sideMenu = false;
    state.exportOpen = false;
    state.sampleActive = false;
    state.userWorkspaceSnapshot = null;
    render();
  });
  document.querySelector("#newNoteBtn")?.addEventListener("click", () => {
    if (state.loading) return;
    state.sampleActive = false;
    state.userWorkspaceSnapshot = null;
    state.passage = "";
    state.analysis = null;
    state.questions = null;
    state.notes = [];
    state.detail = null;
    state.exportOpen = false;
    state.selectedText = "";
    state.tab = "summary";
    state.questionTab = "mc";
    state.userAnswers = { mc: {}, ox: {}, short: {} };
    state.revealAnswers = { mc: {}, ox: {}, short: {} };
    state.shortGrades = {};
    state.qnaInputs = {};
    state.qnaMessages = {};
    state.qnaOpen = {};
    state.botChatThreads = [];
    state.botChatInput = "";
    state.botReplyInputs = {};
    state.botReplyOpen = {};
    state.mindPositions = {};
    state.mindPan = { x: 0, y: 0 };
    state.mindZoom = 1;
    notify("info", "새 분석 노트를 만들었습니다", "이전 작업은 저장 버튼을 눌러 저장할 수 있습니다.");
    render();
  });
  document.querySelector("#menuBtn")?.addEventListener("click", () => { state.sideMenu = true; render(); });
  document.querySelector("#quickMenuBtn")?.addEventListener("click", () => { state.sideMenu = true; render(); });
  document.querySelector("#closeSideMenu")?.addEventListener("click", () => { state.sideMenu = false; render(); });
  document.querySelector("#sideOverlay")?.addEventListener("click", () => { state.sideMenu = false; render(); });
  document.querySelector("#sampleBtn")?.addEventListener("click", () => {
    if (state.sampleActive) {
      const snap = state.userWorkspaceSnapshot || {};
      state.passage = snap.passage || state.userPassageSnapshot || "";
      state.analysis = snap.analysis || null;
      state.questions = snap.questions || null;
      state.notes = snap.notes || [];
      state.tab = snap.tab || "summary";
      state.questionTab = snap.questionTab || "mc";
      state.userAnswers = snap.userAnswers || { mc: {}, ox: {}, short: {} };
      state.revealAnswers = snap.revealAnswers || { mc: {}, ox: {}, short: {} };
      state.shortGrades = snap.shortGrades || {};
      state.qnaInputs = snap.qnaInputs || {};
      state.qnaMessages = snap.qnaMessages || {};
      state.qnaOpen = snap.qnaOpen || {};
      state.botChatThreads = ensureArray(snap.botChatThreads);
      state.mindPositions = snap.mindPositions || {};
      state.mindPan = snap.mindPan || { x: 0, y: 0 };
      state.mindZoom = snap.mindZoom || 1;
      state.sampleActive = false;
      notify("info", "내 지문으로 돌아왔습니다", "샘플 보기 전 분석·문제·메모 상태를 유지했습니다.");
    } else {
      state.userWorkspaceSnapshot = {
        passage: document.querySelector("#passageInput")?.value || state.passage || "",
        analysis: state.analysis, questions: state.questions, notes: state.notes,
        tab: state.tab, questionTab: state.questionTab,
        userAnswers: structuredCloneSafe(state.userAnswers), revealAnswers: structuredCloneSafe(state.revealAnswers),
        shortGrades: structuredCloneSafe(state.shortGrades), qnaInputs: structuredCloneSafe(state.qnaInputs),
        qnaMessages: structuredCloneSafe(state.qnaMessages), qnaOpen: structuredCloneSafe(state.qnaOpen),
        botChatThreads: structuredCloneSafe(state.botChatThreads),
        mindPositions: structuredCloneSafe(state.mindPositions), mindPan: { ...(state.mindPan || { x: 0, y: 0 }) }, mindZoom: state.mindZoom || 1
      };
      state.userPassageSnapshot = state.userWorkspaceSnapshot.passage;
      state.passage = SAMPLE_PASSAGE;
      state.analysis = createDemoAnalysis(SAMPLE_PASSAGE);
      state.questions = createDemoQuestions();
      state.notes = [];
      state.userAnswers = { mc: {}, ox: {}, short: {} };
      state.revealAnswers = { mc: {}, ox: {}, short: {} };
      state.shortGrades = {};
      state.qnaInputs = {};
      state.qnaMessages = {};
      state.qnaOpen = {};
      state.botChatThreads = [];
      state.botChatInput = "";
      state.botReplyInputs = {};
      state.botReplyOpen = {};
      state.mindPositions = {};
      state.mindPan = { x: 0, y: 0 };
      state.mindZoom = 1;
      state.sampleActive = true;
      state.tab = "summary";
    }
    render();
  });
  document.querySelector("#saveBtn")?.addEventListener("click", saveCurrentRecord);
  document.querySelector("#exportBtn")?.addEventListener("click", () => {
    if (!state.analysis) return notify("info", "내보낼 분석이 없습니다", "먼저 지문 분석을 완료해 주세요.");
    state.exportOptions = { ...createDefaultExportOptions(), ...(state.exportOptions || {}) };
    state.exportOpen = true;
    render();
  });
  attachExportEvents();
  document.querySelector("#analyzeBtn")?.addEventListener("click", runAnalysis);
  document.querySelector("#questionBtn")?.addEventListener("click", runQuestionGeneration);
  document.querySelectorAll("[data-question-setting]").forEach((el) => el.addEventListener("click", () => {
    if (el.disabled) return;
    setQuestionSettings({ [el.dataset.questionSetting]: el.dataset.value });
    render();
  }));
  document.querySelector("#singlePassQuestions")?.addEventListener("change", (e) => {
    const next = normalizeQuestionSettings({ ...state.questionSettings, singlePass: e.target.checked });
    state.questionSettings = next;
    persistSettings();
    render();
  });
  document.querySelector(".advanced-question-box")?.addEventListener("toggle", (e) => {
    state.questionSettings = normalizeQuestionSettings({ ...state.questionSettings, advancedOpen: e.target.open });
    persistSettings();
  });
  document.querySelectorAll("[data-question-count]").forEach((el) => el.addEventListener("input", () => {
    setQuestionNestedSetting("counts", el.dataset.questionCount, Number(el.value));
    render();
  }));
  document.querySelectorAll("[data-question-length]").forEach((el) => el.addEventListener("input", () => {
    setQuestionNestedSetting("lengths", el.dataset.questionLength, Number(el.value));
    render();
  }));
  document.querySelectorAll("[data-question-difficulty]").forEach((el) => el.addEventListener("input", () => {
    const v = Number(el.value);
    const diff = v <= 1 ? "low" : v >= 3 ? "high" : "medium";
    setQuestionNestedSetting("typeDifficulties", el.dataset.questionDifficulty, diff);
    render();
  }));
  document.querySelector("#passageInput")?.addEventListener("input", debounce((e) => { state.passage = e.target.value; state.sampleActive = false; }, 80));
  document.querySelector("#ocrCleanBtn")?.addEventListener("click", () => {
    const input = document.querySelector("#passageInput");
    const before = input?.value || state.passage || "";
    const after = normalizeOcrText(before);
    state.passage = after;
    if (input) input.value = after;
    notify("success", "OCR 줄바꿈 정리 완료", "문단 사이 빈 줄은 유지하고, 문단 내부의 강제 줄바꿈을 이어 붙였습니다.");
  });
  document.querySelector("#aiCleanBtn")?.addEventListener("click", runAiCleanup);
  const apiKeyInput = document.querySelector("#apiKeyInput");
  const updateKeyStatus = () => {
    const key = syncApiKeyFromInput();
    const status = document.querySelector("#apiKeyStatus");
    if (status) {
      status.textContent = getMaskedKeyLabel();
      status.classList.toggle("ok", !!key);
    }
  };
  ["input", "change", "keyup", "blur", "paste"].forEach((type) => {
    apiKeyInput?.addEventListener(type, () => setTimeout(updateKeyStatus, 0));
  });
  document.querySelector("#apiKeyApplyBtn")?.addEventListener("click", () => {
    const key = syncApiKeyFromInput({ rerender: false });
    notify(key ? "success" : "error", key ? "API 키 인식됨" : "API 키 없음", key ? "이제 분석하기를 눌러 주세요." : "API 키를 붙여넣고 다시 눌러 주세요.", key ? "" : "입력창이 비어 있습니다.");
  });
  document.querySelector("#modelInput")?.addEventListener("input", debounce((e) => { state.model = e.target.value.trim(); persistSettings(); }, 120));
  document.querySelector("#reasoningModelInput")?.addEventListener("input", debounce((e) => { state.reasoningModel = e.target.value.trim(); persistSettings(); }, 120));
  document.querySelector("#gradingModelInput")?.addEventListener("input", debounce((e) => { state.gradingModel = e.target.value.trim(); persistSettings(); }, 120));
  document.querySelectorAll("[data-model-picker]").forEach((el) => el.addEventListener("click", () => { state.modelPickerTarget = el.dataset.modelPicker; render(); }));
  document.querySelector("#closeModelPicker")?.addEventListener("click", () => { state.modelPickerTarget = null; render(); });
  document.querySelector("#modelBackdrop")?.addEventListener("click", () => { state.modelPickerTarget = null; render(); });
  document.querySelectorAll("[data-pick-model]").forEach((el) => el.addEventListener("click", () => {
    const id = el.dataset.pickModel;
    if (id !== "custom") {
      if (state.modelPickerTarget === "reasoning") {
        state.reasoningModel = id;
        state.useReasoning = getModelPreset(id)?.reasoning || state.useReasoning;
      } else if (state.modelPickerTarget === "grading") {
        state.gradingModel = id;
      } else {
        state.model = id;
      }
      persistSettings();
      notify("success", "모델 선택 완료", `${id} 모델을 선택했습니다.`);
    }
    state.modelPickerTarget = null;
    render();
  }));
  document.querySelector("#effortSelect")?.addEventListener("change", (e) => { state.reasoningEffort = e.target.value; persistSettings(); });
  document.querySelector("#demoToggle")?.addEventListener("change", (e) => { state.demoMode = e.target.checked; persistSettings(); render(); });
  document.querySelector("#reasoningToggle")?.addEventListener("change", (e) => { state.useReasoning = e.target.checked; persistSettings(); render(); });
  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { state.tab = el.dataset.tab; render(); }));
  document.querySelectorAll("[data-qtab]").forEach((el) => el.addEventListener("click", () => { state.questionTab = el.dataset.qtab; render(); }));
  document.querySelectorAll("[data-answer-mc]").forEach((el) => el.addEventListener("click", () => { state.userAnswers.mc[el.dataset.answerMc] = Number(el.dataset.choice); render(); }));
  document.querySelectorAll("[data-clear-mc]").forEach((el) => el.addEventListener("click", () => { delete state.userAnswers.mc[el.dataset.clearMc]; delete state.revealAnswers.mc[el.dataset.clearMc]; render(); }));
  document.querySelectorAll("[data-check-mc]").forEach((el) => el.addEventListener("click", () => checkMultipleChoice(el.dataset.checkMc)));
  document.querySelectorAll("[data-answer-ox]").forEach((el) => el.addEventListener("click", () => { state.userAnswers.ox[el.dataset.answerOx] = el.dataset.choice; render(); }));
  document.querySelectorAll("[data-clear-ox]").forEach((el) => el.addEventListener("click", () => { delete state.userAnswers.ox[el.dataset.clearOx]; delete state.revealAnswers.ox[el.dataset.clearOx]; render(); }));
  document.querySelectorAll("[data-check-ox]").forEach((el) => el.addEventListener("click", () => checkOx(el.dataset.checkOx)));
  document.querySelector("#checkAllOxBtn")?.addEventListener("click", checkAllOx);
  document.querySelector("#retryAllOxBtn")?.addEventListener("click", () => { state.userAnswers.ox = {}; state.revealAnswers.ox = {}; render(); });
  document.querySelectorAll("[data-short-input]").forEach((el) => el.addEventListener("input", debounce(() => { state.userAnswers.short[el.dataset.shortInput] = el.value; }, 80)));
  document.querySelectorAll("[data-clear-short]").forEach((el) => el.addEventListener("click", () => { delete state.userAnswers.short[el.dataset.clearShort]; delete state.shortGrades[el.dataset.clearShort]; render(); }));
  document.querySelectorAll("[data-grade-short]").forEach((el) => el.addEventListener("click", () => runShortAnswerGrade(el.dataset.gradeShort)));
  document.querySelector("#gradeAllShortBtn")?.addEventListener("click", runShortAnswerBatchGrade);
  document.querySelector("#clearAllShortBtn")?.addEventListener("click", () => { state.userAnswers.short = {}; state.shortGrades = {}; render(); });
  document.querySelectorAll("[data-qna-input]").forEach((el) => el.addEventListener("input", debounce(() => { state.qnaInputs[el.dataset.qnaInput] = el.value; }, 80)));
  document.querySelectorAll("[data-qna-ask]").forEach((el) => el.addEventListener("click", () => runQuestionAsk(el.dataset.qnaAsk)));
  document.querySelectorAll("[data-open-qna]").forEach((el) => el.addEventListener("click", () => { state.qnaOpen[el.dataset.openQna] = true; render(); }));
  document.querySelectorAll("[data-close-qna]").forEach((el) => el.addEventListener("click", () => { delete state.qnaOpen[el.dataset.closeQna]; render(); }));
  document.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener("click", () => { state.filters[el.dataset.filter] = !state.filters[el.dataset.filter]; render(); }));
  document.querySelectorAll("[data-jump]").forEach((el) => el.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); jumpToParagraph(el.dataset.jump); }));
  document.querySelectorAll("[data-jump-sentence]").forEach((el) => el.addEventListener("click", () => flashSource(el.dataset.jumpSentence, el.dataset.jump)));
  document.querySelectorAll("[data-flash-text]").forEach((el) => el.addEventListener("click", () => flashSource(el.dataset.flashText, el.dataset.jump)));
  document.querySelectorAll("[data-load-record]").forEach((el) => el.addEventListener("click", () => loadRecord(el.dataset.loadRecord)));
  document.querySelectorAll("[data-del-record]").forEach((el) => el.addEventListener("click", () => deleteSavedRecord(el.dataset.delRecord)));
  document.querySelector("#botChatInput")?.addEventListener("input", debounce((e) => { state.botChatInput = e.target.value; }, 80));
  document.querySelector("#botChatAskBtn")?.addEventListener("click", () => runBotChatAsk());
  document.querySelectorAll("[data-open-bot-reply]").forEach((el) => el.addEventListener("click", () => { const key = el.dataset.openBotReply; state.botReplyOpen[key] = !state.botReplyOpen[key]; render(); }));
  document.querySelectorAll("[data-bot-reply-input]").forEach((el) => el.addEventListener("input", debounce(() => { state.botReplyInputs[el.dataset.botReplyInput] = el.value; }, 80)));
  document.querySelectorAll("[data-bot-reply-ask]").forEach((el) => el.addEventListener("click", () => runBotReplyAsk(el.dataset.botReplyAsk)));
  document.querySelector("#closeDrawer")?.addEventListener("click", () => { state.detail = null; render(); });
  document.querySelector("#readerMemoQuestion")?.addEventListener("input", debounce((e) => { state.memoAskInput = e.target.value; }, 80));
  document.querySelector("#readerMemoAskBtn")?.addEventListener("click", () => runReaderMemoAsk());
  document.querySelector("#toggleReaderAskBtn")?.addEventListener("click", () => { state.readerAskCollapsed = !state.readerAskCollapsed; render(); });
  document.querySelectorAll("[data-reader-quick]").forEach((el) => el.addEventListener("click", () => runReaderMemoAsk(el.dataset.readerQuick)));
  document.querySelector("#selectedMemoQuestion")?.addEventListener("input", debounce((e) => { state.selectedMemoInput = e.target.value; }, 80));
  document.querySelector("#selectedMemoAskBtn")?.addEventListener("click", () => runSelectionQuestion());
  document.querySelectorAll("[data-selected-quick]").forEach((el) => el.addEventListener("click", () => runSelectionQuestion(el.dataset.selectedQuick)));
  document.querySelectorAll("[data-memo-follow-input]").forEach((el) => el.addEventListener("input", debounce(() => { state.memoFollowInputs[el.dataset.memoFollowInput] = el.value; }, 80)));
  document.querySelectorAll("[data-memo-follow-ask]").forEach((el) => el.addEventListener("click", () => runMemoFollowAsk(el.dataset.memoFollowAsk)));
  document.querySelectorAll("[data-memo-follow-quick]").forEach((el) => el.addEventListener("click", () => runMemoFollowAsk(el.dataset.memoFollowQuick, el.dataset.question)));
  document.querySelectorAll("[data-delete-memo]").forEach((el) => el.addEventListener("click", () => deleteMemo(el.dataset.deleteMemo)));
  document.querySelector("#explainSelectionBtn")?.addEventListener("click", runSelectionExplain);
  document.querySelector("#closeLogPanel")?.addEventListener("click", () => { state.logOpen = false; render(); });
  document.querySelector("#logBackdrop")?.addEventListener("click", () => { state.logOpen = false; render(); });
  document.querySelector("#resetMindBtn")?.addEventListener("click", () => { state.mindPositions = {}; state.mindPan = { x: 0, y: 0 }; state.mindZoom = 1; render(); });
  document.querySelector("#mindZoomInBtn")?.addEventListener("click", () => { state.mindZoom = clamp((state.mindZoom || 1) + 0.15, 0.55, 2.2); render(); });
  document.querySelector("#mindZoomOutBtn")?.addEventListener("click", () => { state.mindZoom = clamp((state.mindZoom || 1) - 0.15, 0.55, 2.2); render(); });
  attachHighlightEvents();
  attachSelectionEvents();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  persistSettings();
  render();
}

function getApiKey() {
  return syncApiKeyFromInput();
}

function updateProgressView() {
  const bar = document.querySelector(".progress > span");
  if (bar) bar.style.width = `${state.loadingProgress}%`;
  const steps = [...document.querySelectorAll(".loading-step")];
  if (steps.length) {
    const activeIndex = Math.min(steps.length - 1, Math.floor((state.loadingProgress / 100) * steps.length));
    steps.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
  }
}

function startProgress(kind) {
  state.loading = kind;
  state.loadingProgress = 8;
  render();
  updateProgressView();
  const timer = setInterval(() => {
    if (!state.loading) return clearInterval(timer);
    state.loadingProgress = Math.min(92, state.loadingProgress + Math.random() * 13);
    updateProgressView();
  }, 650);
  return timer;
}


async function runAiCleanup() {
  return runExclusive("cleanup", async () => {
  const input = document.querySelector("#passageInput");
  const before = input?.value || state.passage || "";
  if (!before.trim()) return notify("info", "정돈할 지문이 없습니다", "OCR 지문을 먼저 붙여 넣어 주세요.");
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) return notify("error", "API 키가 없습니다", "AI 정돈은 API 키를 사용합니다. 설정 메뉴에서 키를 입력해 주세요.");
  state.loading = "cleanup";
  state.loadingProgress = 25;
  render();
  try {
    let after;
    if (state.demoMode) {
      await delay(500);
      after = normalizeOcrText(before);
    } else {
      const result = await cleanupPassageWithAi({ apiKey, model: state.gradingModel || state.model, passage: before });
      after = result.cleanedPassage || normalizeOcrText(before);
    }
    state.passage = after.trim();
    const nextInput = document.querySelector("#passageInput");
    if (nextInput) nextInput.value = state.passage;
    notify("success", "AI 지문 정돈 완료", "띄어쓰기와 OCR 줄바꿈을 자연스럽게 정리했습니다.");
  } catch (error) {
    notify("error", "AI 정돈 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    state.loading = null;
    render();
  }
  });
}

async function runAnalysis() {
  return runExclusive("analysis", async () => {
  const text = state.analysis ? state.passage : (document.querySelector("#passageInput")?.value || state.passage);
  const apiKey = getApiKey();
  state.passage = text.trim();
  if (!state.passage) {
    notify("error", "분석할 지문이 없습니다", "OCR 지문을 붙여넣고 문단 사이에 빈 줄을 넣은 뒤 다시 눌러 주세요.", "state.passage is empty");
    return;
  }
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    return;
  }
  const timer = startProgress("analysis");
  try {
    if (state.demoMode) {
      await delay(700);
      state.analysis = normalizeAnalysisResult(createDemoAnalysis(state.passage), state.passage);
      notify("info", "데모 모드 분석", "실제 API 호출 없이 샘플 분석 엔진으로 화면을 구성했습니다. 실제 분석은 데모 모드를 끄세요.");
    } else {
      state.analysis = normalizeAnalysisResult(await analyzePassage({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage
      }), state.passage);
      if (state.analysis?.cleanedPassage && state.analysis.cleanedPassage.length > 20) {
        state.passage = state.analysis.cleanedPassage.trim();
      }
    }
    state.questions = null;
    resetQuestionState();
    state.mindPositions = {};
    state.mindPan = { x: 0, y: 0 };
    state.mindZoom = 1;
    state.tab = "summary";
    state.readerAskCollapsed = false;
  } catch (error) {
    notify("error", "분석 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    clearInterval(timer);
    state.loading = null;
    state.loadingProgress = 100;
    render();
  }
  });
}

async function runQuestionGeneration() {
  return runExclusive("questions", async () => {
  if (!state.analysis) return notify("error", "분석 결과가 없습니다", "먼저 지문 분석을 완료해 주세요.", "state.analysis is null");
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    return;
  }
  const options = getEffectiveQuestionSettings();
  state.questionPhase = getEffectiveQuestionSettings().singlePass ? "단일 호출" : "1/2 5지선다 제작";
  const timer = startProgress("questions");
  try {
    if (state.demoMode) {
      await delay(700);
      const demo = normalizeQuestionSet(createDemoQuestions());
      while (demo.ox.length < options.counts.ox) {
        const i = demo.ox.length + 1;
        demo.ox.push({ id: `ox${i}`, statement: `복습용 진술 ${i}: 지문의 핵심 관점을 한쪽으로 단순화하면 오답이 되기 쉽다.`, answer: i % 2 ? "O" : "X", explanation: "데모 모드 예시입니다. 실제 API 사용 시 지문 기반으로 생성됩니다.", trap: "핵심어만 보고 판단하지 않기" });
      }
      while (demo.multipleChoice.length < options.counts.multipleChoice) {
        const i = demo.multipleChoice.length + 1;
        demo.multipleChoice.push(structuredCloneSafe(demo.multipleChoice[(i - 1) % Math.max(1, demo.multipleChoice.length)] || demo.multipleChoice[0]));
        demo.multipleChoice[demo.multipleChoice.length - 1].id = `mc${i}`;
      }
      while (demo.shortAnswer.length < options.counts.shortAnswer) {
        const i = demo.shortAnswer.length + 1;
        demo.shortAnswer.push({ id: `short${i}`, type: "복습형", question: `지문의 핵심 관계를 ${i}번 관점에서 설명하시오.`, idealAnswer: "지문 속 개념 관계를 근거와 함께 설명한다.", gradingPoints: ["핵심 개념 언급", "지문 근거 연결"], sampleWrongAnswer: "핵심어만 나열한 답안" });
      }
      demo.multipleChoice = demo.multipleChoice.slice(0, options.counts.multipleChoice);
      demo.ox = demo.ox.slice(0, options.counts.ox);
      demo.shortAnswer = demo.shortAnswer.slice(0, options.counts.shortAnswer);
      state.questions = normalizeQuestionSet(demo);
    } else if (options.singlePass) {
      state.questions = normalizeQuestionSet(await generateQuestions({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        analysis: state.analysis,
        options
      }));
    } else {
      state.questionPhase = "1/2 5지선다 제작";
      state.loadingProgress = 8;
      render();
      updateProgressView();
      const mcPart = await generateMultipleChoiceQuestions({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        analysis: state.analysis,
        options
      });
      state.questionPhase = "2/2 OX·서술형 제작";
      state.loadingProgress = 8;
      render();
      updateProgressView();
      const restPart = await generateOxShortQuestions({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        analysis: state.analysis,
        options
      });
      state.questions = normalizeQuestionSet({
        multipleChoice: mcPart.multipleChoice || [],
        ox: restPart.ox || [],
        shortAnswer: restPart.shortAnswer || [],
        weaknessGuide: [...ensureArray(mcPart.weaknessGuide), ...ensureArray(restPart.weaknessGuide)].slice(0, 6)
      });
    }
    resetQuestionState();
    state.tab = "questions";
    state.questionTab = "mc";
  } catch (error) {
    notify("error", "문제 제작 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    clearInterval(timer);
    state.loading = null;
    state.questionPhase = "";
    render();
  }
  });
}

async function runSelectionExplain() {
  return runExclusive("selectionExplain", async () => {
  if (!state.selectedText) return;
  const selectedText = state.selectedText;
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    return;
  }
  const existing = state.notes.slice(0, 5).map((n) => n.selectedText).join(" / ");
  let explanation;
  state.noteLoading = true;
  if (state.tab === "notes") render();
  try {
    if (state.demoMode) {
      await delay(450);
      explanation = {
        simple: `“${selectedText}”은 글의 핵심 흐름에서 중요한 연결 고리입니다. 이 구절은 단독으로 외울 문장이 아니라, 앞에서 나온 개념을 뒤의 주장이나 결론과 이어 주는 역할을 합니다. 따라서 이 부분을 읽을 때는 ‘무엇을 설명하는가’보다 ‘앞뒤 내용의 관계가 어떻게 바뀌는가’를 보는 것이 좋습니다.`
      };
    } else {
      explanation = await explainSelection({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        selectedText,
        memoContext: existing
      });
    }
    state.notes.unshift({ id: uid("note"), selectedText, source: "selection", question: "", explanation, sourcePointer: selectedText, suggestedQuestions: ["더 쉽게 다시 설명해줘", "예시를 만들어줘", "문제 선지로 바뀌면 어떻게 돼?"], thread: [], createdAt: Date.now() });
    state.selectedText = "";
    state.tab = "notes";
  } catch (error) {
    notify("error", "설명 생성 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    state.noteLoading = false;
    render();
  }
  });
}


function getMemoQuestionFromInput(selector, fallback = "") {
  const value = document.querySelector(selector)?.value ?? fallback ?? "";
  return String(value).trim();
}

async function runReaderMemoAsk(quickQuestion = "") {
  if (!state.analysis) return notify("info", "아직 분석 결과가 없습니다", "먼저 지문을 분석한 뒤 질문해 주세요.");
  const question = quickQuestion || getMemoQuestionFromInput("#readerMemoQuestion", state.memoAskInput);
  if (!question) return notify("info", "질문이 비어 있습니다", "예상 질문 버튼을 누르거나 궁금한 점을 적어 주세요.");
  await createMemoAnswer({
    selectedText: state.selectedText || "",
    question,
    source: "reader"
  });
  state.memoAskInput = "";
}

async function runSelectionQuestion(quickQuestion = "") {
  if (!state.selectedText) return notify("info", "선택한 구절이 없습니다", "먼저 지문에서 궁금한 구절을 드래그해 주세요.");
  const question = quickQuestion || getMemoQuestionFromInput("#selectedMemoQuestion", state.selectedMemoInput);
  if (!question) return runSelectionExplain();
  await createMemoAnswer({
    selectedText: state.selectedText,
    question,
    source: "selection"
  });
  state.selectedMemoInput = "";
}

async function createMemoAnswer({ selectedText = "", question = "", source = "reader" }) {
  return runExclusive(source === "reader" ? "readerMemoAsk" : "selectionMemoAsk", async () => {
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    return;
  }
  state.memoAskLoading = source === "reader";
  state.noteLoading = source === "selection";
  if (state.tab === "notes" || source === "reader") render();
  try {
    let result;
    if (state.demoMode) {
      await delay(450);
      result = {
        answer: question.includes("예시")
          ? "예를 들어 어떤 글에서 ‘겉으로는 불편해 보이는 조건’이 오히려 주인공이 자신을 돌아보게 하는 계기가 된다면, 그 조건은 단순한 방해물이 아니라 성찰의 출발점으로 읽을 수 있습니다. 이 지문에서도 선택한 구절은 그런 식으로 앞뒤 논리를 이어 주는 역할을 합니다."
          : "이 질문은 지문의 핵심 개념이 서로 어떻게 이어지는지를 묻고 있습니다. 선택한 구절은 단독으로 외울 문장이 아니라, 앞의 개념을 뒤의 결론으로 넘겨 주는 연결부로 읽어야 합니다. 그래서 단어 하나보다 관계와 방향을 보는 것이 중요합니다.",
        sourcePointer: selectedText ? `선택 구절: ${shorten(selectedText, 80)}` : "지문 전체",
        suggestedQuestions: ["더 쉽게 다시 설명해줘", "예시를 하나 더 들어줘", "문제 선지로 바뀌면 어떻게 돼?"]
      };
    } else {
      result = await askAboutMemo({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        selectedText,
        userQuestion: question,
        memoThread: []
      });
    }
    state.notes.unshift({
      id: uid("note"),
      selectedText: selectedText || "지문 전체 질문",
      source,
      question,
      explanation: { simple: result.answer },
      sourcePointer: result.sourcePointer || "",
      suggestedQuestions: result.suggestedQuestions || [],
      thread: [],
      createdAt: Date.now()
    });
    if (source === "selection") state.selectedText = "";
    state.tab = "notes";
  } catch (error) {
    notify("error", "메모 질문 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    state.memoAskLoading = false;
    state.noteLoading = false;
    render();
  }
  });
}

async function runMemoFollowAsk(noteId, quickQuestion = "") {
  return runExclusive(`memoFollow:${noteId}`, async () => {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return notify("error", "메모를 찾지 못했습니다", "이어 질문할 메모가 없습니다.", `note not found: ${noteId}`);
  const question = quickQuestion || getMemoQuestionFromInput(`[data-memo-follow-input="${safeCssEscape(noteId)}"]`, state.memoFollowInputs[noteId]);
  if (!question) return notify("info", "질문이 비어 있습니다", "이어 묻고 싶은 내용을 적어 주세요.");
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    return;
  }
  state.memoFollowLoading = noteId;
  render();
  try {
    const memoThread = [
      { question: note.question || "처음 설명", answer: note.explanation?.simple || "" },
      ...(note.thread || []).map((m) => ({ question: m.question, answer: m.answer }))
    ];
    let result;
    if (state.demoMode) {
      await delay(450);
      result = {
        answer: "방금 메모의 흐름을 이어서 보면, 핵심은 선택 구절을 혼자 떼어 읽지 말고 앞뒤 개념과의 관계로 보는 것입니다. 질문한 내용은 이 관계를 더 쉬운 말로 바꾸거나 예시로 확장하는 방식으로 이해하면 됩니다.",
        sourcePointer: note.sourcePointer || note.selectedText || "기존 메모",
        suggestedQuestions: ["더 짧게 요약해줘", "반대로 오해하면 어떻게 돼?", "예시를 바꿔줘"]
      };
    } else {
      result = await askAboutMemo({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        selectedText: note.selectedText,
        userQuestion: question,
        memoThread
      });
    }
    if (!note.thread) note.thread = [];
    note.thread.push({ question, answer: result.answer, sourcePointer: result.sourcePointer || "", createdAt: Date.now() });
    note.suggestedQuestions = result.suggestedQuestions || note.suggestedQuestions || [];
    state.memoFollowInputs[noteId] = "";
  } catch (error) {
    notify("error", "이어 질문 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    state.memoFollowLoading = null;
    render();
  }
  });
}


function findQuestion(type, id) {
  if (!state.questions) return null;
  if (type === "mc") return (state.questions.multipleChoice || []).find((q) => q.id === id);
  if (type === "ox") return (state.questions.ox || []).find((q) => q.id === id);
  if (type === "short") return (state.questions.shortAnswer || []).find((q) => q.id === id);
  return null;
}

function checkMultipleChoice(id) {
  if (!state.userAnswers.mc[id]) {
    notify("info", "아직 선택하지 않았습니다", "먼저 1~5번 중 하나를 고른 뒤 채점하세요.");
    return;
  }
  state.revealAnswers.mc[id] = true;
  render();
}


function checkAllOx() {
  const list = state.questions?.ox || [];
  const unanswered = list.filter((q) => !state.userAnswers.ox[q.id]).length;
  if (unanswered) {
    notify("info", "아직 안 푼 OX가 있습니다", `${unanswered}개 문항의 O/X를 먼저 선택해 주세요.`);
    return;
  }
  list.forEach((q) => { state.revealAnswers.ox[q.id] = true; });
  render();
}

function checkOx(id) {
  if (!state.userAnswers.ox[id]) {
    notify("info", "아직 선택하지 않았습니다", "먼저 O 또는 X를 고른 뒤 채점하세요.");
    return;
  }
  state.revealAnswers.ox[id] = true;
  render();
}

function getShortAnswerInput(id) {
  const el = Array.from(document.querySelectorAll("[data-short-input]")).find((node) => node.dataset.shortInput === id);
  const value = el?.value ?? state.userAnswers.short[id] ?? "";
  state.userAnswers.short[id] = value;
  return value.trim();
}


async function runShortAnswerBatchGrade() {
  return runExclusive("shortBatchGrade", async () => {
  const list = state.questions?.shortAnswer || [];
  if (!list.length) return notify("info", "서술형 문항이 없습니다", "먼저 문제를 생성해 주세요.");
  const items = list.map((q) => {
    const el = Array.from(document.querySelectorAll("[data-short-input]")).find((node) => node.dataset.shortInput === q.id);
    const userAnswer = (el?.value ?? state.userAnswers.short[q.id] ?? "").trim();
    state.userAnswers.short[q.id] = userAnswer;
    return { id: q.id, question: q.question, idealAnswer: q.idealAnswer, gradingPoints: q.gradingPoints, userAnswer };
  });
  const empty = items.filter((it) => !it.userAnswer).length;
  if (empty) return notify("info", "빈 서술형 답안이 있습니다", `${empty}개 답안을 작성한 뒤 전체 채점해 주세요.`);
  if (!state.shortGradeConfirm.__batch) {
    state.shortGradeConfirm.__batch = true;
    notify("info", "AI 키 사용 확인", `서술형 전체 채점은 저비용 채점 모델(${state.gradingModel})과 API 키를 사용합니다. 한 번 더 누르면 실행됩니다.`);
    render();
    window.setTimeout(() => { if (state.shortGradeConfirm.__batch) { delete state.shortGradeConfirm.__batch; render(); } }, 8000);
    return;
  }
  delete state.shortGradeConfirm.__batch;
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) return notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 입력해 주세요.");
  list.forEach((q) => { state.shortGradeLoading[q.id] = true; });
  render();
  try {
    let results;
    if (state.demoMode) {
      await delay(700);
      results = items.map((it) => ({ id: it.id, score: it.userAnswer.length > 35 ? 4.2 : 3.0, maxScore: 5, isAcceptable: it.userAnswer.length > 25, verdict: it.userAnswer.length > 25 ? "대체로 적절합니다" : "보완이 필요합니다", strength: "핵심어를 활용하려는 점이 좋습니다.", weakness: "문단 근거와 원인·결과 관계를 더 분명히 써 주세요.", improvedAnswer: it.idealAnswer }));
    } else {
      const data = await gradeShortAnswersBatch({ apiKey, model: state.gradingModel || state.model, passage: state.passage, items });
      results = data.results || [];
    }
    results.forEach((r) => { state.shortGrades[r.id] = r; });
  } catch (error) {
    notify("error", "서술형 전체 채점 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    list.forEach((q) => { delete state.shortGradeLoading[q.id]; });
    render();
  }
  });
}

async function runShortAnswerGrade(id) {
  return runExclusive(`shortGrade:${id}`, async () => {
  const q = findQuestion("short", id);
  if (!q) return notify("error", "문항을 찾지 못했습니다", "서술형 문항 데이터가 없습니다.", `short question not found: ${id}`);
  const userAnswer = getShortAnswerInput(id);
  if (!userAnswer) return notify("info", "답안이 비어 있습니다", "서술형 답안을 먼저 작성해 주세요.");

  if (!state.shortGradeConfirm[id]) {
    state.shortGradeConfirm[id] = true;
    notify("info", "AI 키 사용 확인", "서술형 채점은 현재 선택된 AI 모델/API 키를 사용합니다. 한 번 더 누르면 채점합니다.");
    render();
    window.setTimeout(() => {
      if (state.shortGradeConfirm[id]) {
        delete state.shortGradeConfirm[id];
        render();
      }
    }, 8000);
    return;
  }
  delete state.shortGradeConfirm[id];

  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    render();
    return;
  }
  state.shortGradeLoading[id] = true;
  render();
  try {
    let result;
    if (state.demoMode) {
      await delay(650);
      result = {
        score: Math.min(5, Math.max(2, userAnswer.length > 35 ? 4.2 : 3.1)),
        maxScore: 5,
        isAcceptable: userAnswer.length > 25,
        verdict: userAnswer.length > 25 ? "대체로 적절합니다" : "핵심 근거가 부족합니다",
        strength: "지문 핵심어를 사용해 답안을 구성하려는 점이 좋습니다.",
        weakness: "지문 속 원인·결과 관계나 비교 기준을 더 명확히 써야 합니다.",
        improvedAnswer: q.idealAnswer || "지문의 핵심 개념을 문단 근거와 연결하여 한 문단으로 정리하면 좋습니다."
      };
    } else {
      result = await gradeShortAnswer({
        apiKey,
        model: state.gradingModel || state.model,
        reasoningMode: false,
        reasoningEffort: "low",
        passage: state.passage,
        question: q.question,
        idealAnswer: q.idealAnswer,
        gradingPoints: q.gradingPoints,
        userAnswer
      });
    }
    state.shortGrades[id] = result;
  } catch (error) {
    notify("error", "서술형 채점 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    delete state.shortGradeLoading[id];
    render();
  }
  });
}

function getQnaInput(key) {
  const el = Array.from(document.querySelectorAll("[data-qna-input]")).find((node) => node.dataset.qnaInput === key);
  const value = el?.value ?? state.qnaInputs[key] ?? "";
  state.qnaInputs[key] = value;
  return value.trim();
}

async function runQuestionAsk(key) {
  return runExclusive(`questionAsk:${key}`, async () => {
  const [type, id] = String(key).split(":");
  const q = findQuestion(type, id);
  if (!q) return notify("error", "문항을 찾지 못했습니다", "질문할 문항 데이터가 없습니다.", `question not found: ${key}`);
  const userQuestion = getQnaInput(key);
  if (!userQuestion) return notify("info", "질문이 비어 있습니다", "납득 안 되는 선지나 개념을 질문 칸에 적어 주세요.");
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    return;
  }
  const selectedAnswer = type === "mc" ? state.userAnswers.mc[id] : type === "ox" ? state.userAnswers.ox[id] : state.userAnswers.short[id];
  const solved = type === "mc" ? !!state.revealAnswers.mc[id] : type === "ox" ? !!state.revealAnswers.ox[id] : !!state.shortGrades[id];
  state.qnaLoading = key;
  render();
  try {
    let result;
    if (state.demoMode) {
      await delay(500);
      result = {
        answer: solved
          ? "채점 결과를 기준으로 보면, 이 문항은 지문의 핵심 개념과 선지의 표현 범위를 맞추는 문제가 됩니다. 선택한 선지가 지문 표현을 과장하거나 반대로 바꾸지 않았는지 확인해 보세요."
          : "아직 정답을 바로 말하지는 않을게요. 먼저 선지의 핵심어가 지문에서 어떤 관계로 쓰였는지, 그리고 보기의 조건을 빠뜨리지 않았는지 확인해 보세요.",
        hintLevel: solved ? "해설" : "힌트",
        sourcePointer: q.passageExtract || "문제의 발췌/보기와 연결된 문단"
      };
    } else {
      result = await askAboutQuestion({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        questionData: q,
        userQuestion,
        selectedAnswer,
        solved
      });
    }
    if (!state.qnaMessages[key]) state.qnaMessages[key] = [];
    state.qnaMessages[key].push({ question: userQuestion, answer: result.answer, sourcePointer: result.sourcePointer || "" });
    state.qnaInputs[key] = "";
  } catch (error) {
    notify("error", "질문 답변 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    state.qnaLoading = null;
    render();
  }
  });
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }


function getBotThread(threadId) {
  return (state.botChatThreads || []).find((t) => t.id === threadId) || null;
}

function findBotComment(comments = [], commentId) {
  for (const comment of comments) {
    if (comment.id === commentId) return comment;
    for (const rt of ensureArray(comment.replyThreads)) {
      const found = findBotComment(rt.comments || [], commentId);
      if (found) return found;
    }
  }
  return null;
}

function hashString(value = "") {
  let hash = 0;
  for (const ch of String(value || "")) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function pickBotAvatarId(index = 0, seed = "") {
  const offset = hashString(seed) % CHAT_PROFILE_COUNT;
  return ((offset + index) % CHAT_PROFILE_COUNT) + 1;
}

function normalizeBotComments(comments = [], parentId = "", avatarSeed = "") {
  const fallbackNames = ["문단밀수꾼", "선지비빔밥", "밑줄뒤망령", "오답수거반", "지문옆집사람", "단어가방털이", "국어하다온사람", "개념도둑맞음" ];
  const seed = `${avatarSeed || "thread"}:${parentId || "root"}`;
  return ensureArray(comments).slice(0, 8).map((c, index) => ({
    id: c?.id || uid("bot"),
    avatarId: Number(c?.avatarId) || pickBotAvatarId(index, seed),
    author: String(c?.author || fallbackNames[index % fallbackNames.length]).slice(0, 18),
    persona: String(c?.persona || "").slice(0, 24),
    text: shorten(String(c?.text || "음... 이건 지문에서 근거를 먼저 주워 와야겠는데? 일단 문단부터 잡고 가자.").replace(/\s+/g, " "), 340),
    sourcePointer: shorten(String(c?.sourcePointer || ""), 90),
    timeLabel: shorten(String(c?.timeLabel || (index ? "방금 전" : "지금")), 12),
    sideReplies: ensureArray(c?.sideReplies).slice(0, 2).map((r, ri) => ({
      author: String(r?.author || (ri ? "지나가던 독자" : "옆댓글")).slice(0, 18),
      text: shorten(String(r?.text || "그 말도 맞는데, 근거는 살짝 더 좁게 봐야 함.").replace(/\s+/g, " "), 160)
    })),
    parentId,
    replyThreads: ensureArray(c?.replyThreads).map((rt, rtIndex) => ({
      ...rt,
      comments: normalizeBotComments(rt?.comments || [], c?.id || parentId, `${seed}:${index}:${rtIndex}`)
    }))
  }));
}

async function runBotChatAsk(quickQuestion = "") {
  if (!state.analysis) return notify("info", "분석 결과가 없습니다", "먼저 지문을 분석한 뒤 AI 댓글을 남겨 주세요.");
  const question = (quickQuestion || document.querySelector("#botChatInput")?.value || state.botChatInput || "").trim();
  if (!question) return notify("info", "질문이 비어 있습니다", "질문을 직접 입력하거나 예상 질문 버튼을 눌러 주세요.");
  return runExclusive("botChatAsk", async () => {
    const apiKey = getApiKey();
    if (!state.demoMode && !apiKey) return notify("error", "API 키가 없습니다", "AI 댓글 기능은 API 키를 사용합니다. 설정 메뉴에서 키를 입력해 주세요.");
    state.botChatLoading = true;
    state.tab = "comments";
    render();
    try {
      let result;
      if (state.demoMode) {
        await delay(450);
        result = createDemoBotComments(question, false);
      } else {
        result = await askChatBots({
          apiKey,
          model: state.gradingModel || state.model,
          passage: state.passage,
          analysis: state.analysis,
          userQuestion: question,
          parentComment: null,
          replyMode: false
        });
      }
      state.botChatThreads.unshift({
        id: uid("thread"),
        question,
        createdAt: Date.now(),
        comments: normalizeBotComments(result.comments || [], "", question)
      });
      state.botChatInput = "";
    } catch (error) {
      notify("error", "AI 댓글 생성 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
    } finally {
      state.botChatLoading = false;
      render();
    }
  });
}

async function runBotReplyAsk(key) {
  const [threadId, commentId] = String(key || "").split(":");
  const thread = getBotThread(threadId);
  const parent = thread ? findBotComment(thread.comments || [], commentId) : null;
  const question = (document.querySelector(`[data-bot-reply-input="${cssEscape(key)}"]`)?.value || state.botReplyInputs[key] || "").trim();
  if (!thread || !parent) return notify("error", "댓글을 찾을 수 없습니다", "페이지를 새로고침한 뒤 다시 시도해 주세요.");
  if (!question) return notify("info", "질문이 비어 있습니다", "답글에 이어서 물어볼 내용을 적어 주세요.");
  return runExclusive(`botReply:${key}`, async () => {
    const apiKey = getApiKey();
    if (!state.demoMode && !apiKey) return notify("error", "API 키가 없습니다", "AI 댓글 기능은 API 키를 사용합니다. 설정 메뉴에서 키를 입력해 주세요.");
    state.botReplyLoading = key;
    render();
    try {
      let result;
      if (state.demoMode) {
        await delay(350);
        result = createDemoBotComments(question, true);
      } else {
        result = await askChatBots({
          apiKey,
          model: state.gradingModel || state.model,
          passage: state.passage,
          analysis: state.analysis,
          userQuestion: question,
          parentComment: parent,
          replyMode: true
        });
      }
      parent.replyThreads = ensureArray(parent.replyThreads);
      parent.replyThreads.push({ id: uid("reply"), question, comments: normalizeBotComments(result.comments || [], parent.id, `${threadId}:${commentId}:${question}`).slice(0, 2) });
      state.botReplyInputs[key] = "";
    } catch (error) {
      notify("error", "답글 생성 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
    } finally {
      state.botReplyLoading = null;
      render();
    }
  });
}

function createDemoBotComments(question, replyMode = false) {
  const base = replyMode ? [
    { author: "문단밀수꾼", text: "그 질문이면 부모 댓글에서 ‘대상’이 어디로 잡혔는지부터 봐야 함. 결론만 들고 뛰면 선지가 뒤에서 발목 잡음.", timeLabel: "방금 전" },
    { author: "옆자리개추러", text: "윗댓 말 맞음. 지금은 답보다 조건 찾기가 먼저임. 조건 빼고 말하면 갑자기 맞는 듯한 오답 됨ㅋㅋ", timeLabel: "방금 전" }
  ] : [
    { author: "선지비빔밥", text: "이건 단어 하나로 끝나는 질문이 아니라, 앞 문단 조건이랑 같이 비벼야 풀림. 비빔은 맛있는데 선지는 이렇게 비비면 위험함.", timeLabel: "지금" },
    { author: "오답수거반", text: "지문 안에서 정한 관계 밖으로 나가면 바로 미끄러짐. ‘그럴듯한 일반론’ 말고, 해당 문단이 걸어 둔 조건 안에서만 판단해야 해.", timeLabel: "방금 전" },
    { author: "밑줄뒤망령", text: "나라면 이거 선지로 낼 때 인과 방향만 슬쩍 뒤집음. 읽은 사람은 불편해하고 안 읽은 사람은 박수치며 틀림.", timeLabel: "방금 전", sideReplies: [{ author: "지문옆집사람", text: "님 표현은 수상한데 맞는 말이라 더 수상함." }] },
    { author: "단어가방털이", text: "헷갈리면 ‘이 문장이 설명하는 대상이 뭐냐’부터 잡아 봐. 대상이 바뀌는 순간 같은 말처럼 보여도 다른 선지가 됨.", timeLabel: "방금 전" }
  ];
  return { comments: base.slice(0, replyMode ? 2 : 4).map((c) => ({ id: uid("bot"), persona: "", sourcePointer: "", ...c })) };
}

function createRecordPayload({ id, createdAt, overwrittenFrom = "" } = {}) {
  const now = Date.now();
  return {
    id: id || uid("analysis"),
    title: state.analysis?.title || "무제 분석",
    field: state.analysis?.field || "",
    createdAt: createdAt || now,
    updatedAt: now,
    overwrittenFrom,
    passage: state.passage,
    analysis: state.analysis,
    questions: state.questions,
    notes: state.notes,
    userAnswers: state.userAnswers,
    revealAnswers: state.revealAnswers,
    shortGrades: state.shortGrades,
    qnaMessages: state.qnaMessages,
    botChatThreads: state.botChatThreads
  };
}

function saveCurrentRecord() {
  if (!state.analysis) return;
  const loadedRecord = state.currentRecordId ? state.records.find((r) => r.id === state.currentRecordId) : null;
  let record;

  if (loadedRecord) {
    const overwrite = window.confirm(
      `이 분석은 저장된 노트 '${loadedRecord.title || "무제 분석"}'에서 불러온 내용입니다.\n\n확인: 기존 저장본에 덮어쓰기\n취소: 새 저장본으로 저장`
    );
    record = overwrite
      ? createRecordPayload({ id: loadedRecord.id, createdAt: loadedRecord.createdAt || Date.now() })
      : createRecordPayload({ overwrittenFrom: loadedRecord.id });
  } else {
    record = createRecordPayload();
  }

  state.records = saveRecord(record);
  state.currentRecordId = record.id;
  state.tab = "saved";
  notify("success", loadedRecord && record.id === loadedRecord.id ? "저장본 덮어쓰기 완료" : "새 저장본 생성 완료", "현재 분석 내용을 저장했습니다.");
  render();
}

function loadRecord(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;
  state.currentRecordId = record.id;
  state.passage = record.passage || "";
  state.analysis = record.analysis ? normalizeAnalysisResult(record.analysis, state.passage) : null;
  state.questions = record.questions ? normalizeQuestionSet(record.questions) : null;
  state.notes = ensureArray(record.notes);
  state.userAnswers = record.userAnswers || { mc: {}, ox: {}, short: {} };
  state.revealAnswers = record.revealAnswers || { mc: {}, ox: {}, short: {} };
  state.shortGrades = record.shortGrades || {};
  state.qnaMessages = record.qnaMessages || {};
  state.botChatThreads = ensureArray(record.botChatThreads);
  state.tab = "summary";
  notify("success", "저장본 불러오기 완료", "다시 저장하면 덮어쓰기 또는 새 저장본 저장을 선택할 수 있습니다.");
  render();
}

function deleteSavedRecord(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;
  const ok = window.confirm(`저장된 분석 '${record.title || "무제 분석"}'을 삭제하시겠습니까?\n삭제한 항목은 되돌릴 수 없습니다.`);
  if (!ok) return;
  state.records = deleteRecord(id);
  if (state.currentRecordId === id) state.currentRecordId = null;
  notify("success", "저장본 삭제 완료", "선택한 저장본을 삭제했습니다.");
  render();
}

function jumpToParagraph(pid) {
  const el = document.getElementById(pid);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate([
    { boxShadow: "0 0 0 0 rgba(79,70,229,0)" },
    { boxShadow: "0 0 0 6px rgba(79,70,229,.18)" },
    { boxShadow: "0 0 0 0 rgba(79,70,229,0)" }
  ], { duration: 900, easing: "ease-in-out" });
}

function flashSource(text, pid = "") {
  if (!text) return;
  state.flash = { text, pid };
  render();
  if (pid) jumpToParagraph(pid);
  window.setTimeout(() => {
    if (state.flash?.text === text) {
      state.flash = null;
      render();
    }
  }, 3000);
}

function attachHighlightEvents() {
  const tooltip = document.querySelector("#tooltip");
  if (!tooltip) return;
  document.querySelectorAll(".hl").forEach((el) => {
    const ids = String(el.dataset.hid || "").split(",").filter(Boolean);
    const group = ids.map((id) => state.analysis?.highlights?.find((item) => item.id === id)).filter(Boolean);
    const cleanText = el.textContent.trim();
    const labelLine = group.length ? group.map((h) => h.type).join(" · ") : (el.dataset.title || "형광펜");
    const relationLine = group.length ? group.map((h) => h.shortReason).filter(Boolean).join(" / ") : (el.dataset.reason || "");
    const detail = group.length
      ? group.map((h) => `• ${h.detail}`).join("\n")
      : "이 구절이 지문에서 어떤 의미를 갖는지 클릭해서 확인하세요.";
    el.addEventListener("mouseenter", () => {
      tooltip.querySelector(".t-title").textContent = cleanText || "형광펜 구절";
      tooltip.querySelector(".t-body").textContent = detail || "클릭하면 더 자세히 볼 수 있습니다.";
      tooltip.classList.add("show");
    });
    el.addEventListener("mousemove", (e) => {
      const x = Math.min(window.innerWidth - 420, e.clientX + 16);
      const y = Math.min(window.innerHeight - 190, e.clientY + 18);
      tooltip.style.left = `${Math.max(12, x)}px`;
      tooltip.style.top = `${Math.max(12, y)}px`;
    });
    el.addEventListener("mouseleave", () => tooltip.classList.remove("show"));
    el.addEventListener("click", () => {
      state.detail = {
        title: cleanText || "형광펜 상세",
        body: detail || "",
        extra: `분류: ${labelLine}${relationLine ? `\n연결: ${relationLine}` : ""}`
      };
      render();
    });
  });
}

function attachSelectionEvents() {
  const reader = document.querySelector("#readerContent");
  if (!reader) return;
  reader.addEventListener("mouseup", () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 1) {
      state.selectedText = text.slice(0, 600);
      notify("info", "구절 선택됨", "메모 탭에서 AI 설명 메모를 만들 수 있습니다.");
      if (state.tab === "notes") render();
    }
  });
}

function renderMindmap(reset = false) {
  const svg = document.querySelector("#mindmapSvg");
  const wrap = document.querySelector("#mindmapWrap");
  if (!svg || !wrap || !state.analysis?.mindmap) return;
  const nodes = state.analysis.mindmap.nodes || [];
  const edges = state.analysis.mindmap.edges || [];
  if (!nodes.length) return;
  if (reset) state.mindPositions = {};

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const center = nodes.find((n) => String(n.kind || "").toLowerCase().includes("center")) || nodes[0];
  const childrenBySource = new Map();
  for (const e of edges) {
    if (!childrenBySource.has(e.source)) childrenBySource.set(e.source, []);
    childrenBySource.get(e.source).push(e.target);
  }
  let roots = (childrenBySource.get(center.id) || []).map((id) => byId.get(id)).filter(Boolean);
  if (!roots.length) roots = nodes.filter((n) => n.id !== center.id).slice(0, 7);

  const cx = 950;
  const cy = 600;
  function polar(angleDeg, radius) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  }

  function defaultShape(node, level = 1, branch = 0) {
    if (node.id === center.id) return { x: cx, y: cy, rx: 122, ry: 58, level: 0, branch: 0 };
    const base = level === 1 ? { rx: 116, ry: 48 } : { rx: 96, ry: 40 };
    return { ...base, level, branch };
  }

  const assigned = new Set([center.id]);
  const defaultPositions = new Map();
  defaultPositions.set(center.id, defaultShape(center, 0, 0));

  const rootCount = roots.length;
  const startAngle = rootCount <= 3 ? -90 : -110;
  const span = rootCount <= 3 ? 180 : 300;
  roots.forEach((root, i) => {
    const angle = rootCount === 1 ? 0 : startAngle + (span * i) / Math.max(1, rootCount - 1);
    const pos = polar(angle, 330);
    defaultPositions.set(root.id, { ...defaultShape(root, 1, i % 8), ...pos, angle });
    assigned.add(root.id);
    const childIds = (childrenBySource.get(root.id) || []).filter((id) => id !== center.id && byId.has(id));
    const spread = Math.min(58, Math.max(24, 96 / Math.max(1, childIds.length)));
    childIds.forEach((cid, ci) => {
      const child = byId.get(cid);
      const childAngle = angle + (ci - (childIds.length - 1) / 2) * spread;
      const childPos = polar(childAngle, 570);
      defaultPositions.set(cid, { ...defaultShape(child, 2, i % 8), ...childPos, angle: childAngle });
      assigned.add(cid);
      const grandIds = (childrenBySource.get(cid) || []).filter((id) => byId.has(id));
      grandIds.slice(0, 2).forEach((gid, gi) => {
        const g = byId.get(gid);
        const ga = childAngle + (gi - .5) * 22;
        defaultPositions.set(gid, { ...defaultShape(g, 2, i % 8), ...polar(ga, 720), angle: ga, rx: 82, ry: 35 });
        assigned.add(gid);
      });
    });
  });

  nodes.filter((n) => !assigned.has(n.id)).forEach((n, i) => {
    const pos = polar(-80 + i * 26, 720);
    defaultPositions.set(n.id, { ...defaultShape(n, 2, i % 8), ...pos, angle: -80 + i * 26 });
  });

  nodes.forEach((node) => {
    const base = defaultPositions.get(node.id) || defaultShape(node, 2, 0);
    if (!state.mindPositions[node.id]) state.mindPositions[node.id] = base;
    else state.mindPositions[node.id] = { ...base, ...state.mindPositions[node.id] };
  });

  const virtualEdges = edges.length ? edges : roots.map((r) => ({ source: center.id, target: r.id, label: "구성" }));
  const edgeHtml = virtualEdges.map((e) => {
    const s = state.mindPositions[e.source];
    const t = state.mindPositions[e.target];
    if (!s || !t) return "";
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const sx = s.x + (dx / len) * (s.rx || 90);
    const sy = s.y + (dy / len) * (s.ry || 40);
    const tx = t.x - (dx / len) * (t.rx || 90);
    const ty = t.y - (dy / len) * (t.ry || 40);
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const curve = 28;
    const c1x = sx + dx * .36 - (dy / len) * curve;
    const c1y = sy + dy * .36 + (dx / len) * curve;
    const c2x = sx + dx * .64 - (dy / len) * curve;
    const c2y = sy + dy * .64 + (dx / len) * curve;
    return `<path class="edge branch-${t.branch || 0}" d="M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}"></path><text class="edge-label" x="${mx}" y="${my - 8}" text-anchor="middle">${escapeHtml(e.label || "")}</text>`;
  }).join("");

  const nodeHtml = nodes.map((n) => {
    const p = state.mindPositions[n.id];
    const labelLines = svgTextLines(n.label || "", p.level === 0 ? 18 : 16, p.level === 0 ? 2 : 2);
    const summaryLines = svgTextLines(n.summary || n.kind || "", p.level === 0 ? 22 : 18, p.level === 0 ? 1 : 2);
    const labelY = p.level === 0 ? -12 : -8;
    const summaryY = p.level === 0 ? 24 : 20;
    return `<g class="node node-bubble branch-${p.branch || 0} level-${p.level} ${p.level >= 2 ? "leaf-node" : ""}" data-node="${escapeHtml(n.id)}" transform="translate(${p.x} ${p.y})">
      <ellipse rx="${p.rx}" ry="${p.ry}"></ellipse>
      <text class="node-title" x="0" y="${labelY}">${labelLines.map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 17}">${escapeHtml(line)}</tspan>`).join("")}</text>
      <text class="node-summary" x="0" y="${summaryY}">${summaryLines.map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 14}">${escapeHtml(line)}</tspan>`).join("")}</text>
    </g>`;
  }).join("");

  const pan = state.mindPan || { x: 0, y: 0 };
  const zoom = state.mindZoom || 1;
  svg.innerHTML = `<rect class="mind-bg" x="0" y="0" width="1900" height="1200" fill="transparent"></rect><g id="mindCanvas" transform="translate(${pan.x} ${pan.y}) scale(${zoom})"><g class="edges">${edgeHtml}</g><g class="nodes">${nodeHtml}</g></g>`;
  attachMindmapEvents(svg, wrap);
}

function svgTextLines(text, limit = 16, maxLines = 2) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const out = [];
  let cur = "";
  for (const ch of clean) {
    const next = cur + ch;
    if (next.length > limit && cur) {
      out.push(cur);
      cur = ch;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.slice(0, maxLines).map((line, i) => i === maxLines - 1 && out.length > maxLines ? `${line.slice(0, Math.max(1, limit - 1))}…` : line);
}

function attachMindmapEvents(svg, wrap) {
  let dragging = null;
  let activeEl = null;
  let moved = false;
  let offset = { x: 0, y: 0 };
  const tooltip = document.querySelector("#tooltip");
  const toSvgPoint = (event) => {
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const raw = pt.matrixTransform(svg.getScreenCTM().inverse());
    const pan = state.mindPan || { x: 0, y: 0 };
    const zoom = state.mindZoom || 1;
    return { x: (raw.x - pan.x) / zoom, y: (raw.y - pan.y) / zoom };
  };
  const toRawSvgPoint = (event) => {
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  svg.querySelectorAll(".node").forEach((el) => {
    const nodeId = el.dataset.node;
    const node = state.analysis.mindmap.nodes.find((n) => n.id === nodeId);
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = nodeId;
      activeEl = el;
      moved = false;
      el.classList.add("dragging");
      const pt = toSvgPoint(e);
      offset.x = pt.x - state.mindPositions[nodeId].x;
      offset.y = pt.y - state.mindPositions[nodeId].y;
      try { svg.setPointerCapture(e.pointerId); } catch {}
    });
    el.addEventListener("mouseenter", () => {
      if (!tooltip || !node) return;
      tooltip.querySelector(".t-title").textContent = node.label || "마인드맵";
      tooltip.querySelector(".t-body").textContent = node.summary || "클릭하면 상세 설명이 열립니다.";
      tooltip.classList.add("show");
    });
    el.addEventListener("mousemove", (e) => {
      if (!tooltip) return;
      const x = Math.min(window.innerWidth - 380, e.clientX + 16);
      const y = Math.min(window.innerHeight - 160, e.clientY + 18);
      tooltip.style.left = `${Math.max(12, x)}px`;
      tooltip.style.top = `${Math.max(12, y)}px`;
    });
    el.addEventListener("mouseleave", () => tooltip?.classList.remove("show"));
    el.addEventListener("click", () => {
      if (moved || !node) return;
      state.detail = { title: node.label, body: node.summary, extra: "이 노드와 연결된 가지를 따라가면 지문의 전개 흐름을 볼 수 있습니다." };
      render();
    });
  });


  let panning = false;
  let panStart = { x: 0, y: 0 };
  let panBase = { x: 0, y: 0 };
  svg.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });
  svg.addEventListener("pointerdown", (e) => {
    if (dragging) return;
    const isBackground = e.target === svg || e.target.classList?.contains("mind-bg") || e.target.classList?.contains("edge") || e.button === 1;
    if (!isBackground) return;
    e.preventDefault();
    panning = true;
    panStart = toRawSvgPoint(e);
    panBase = { ...(state.mindPan || { x: 0, y: 0 }) };
    wrap.classList.add("panning");
    try { svg.setPointerCapture(e.pointerId); } catch {}
  });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    state.mindZoom = clamp((state.mindZoom || 1) + delta, 0.55, 2.2);
    const canvas = svg.querySelector("#mindCanvas");
    if (canvas) canvas.setAttribute("transform", `translate(${(state.mindPan || {x:0,y:0}).x} ${(state.mindPan || {x:0,y:0}).y}) scale(${state.mindZoom || 1})`);
    const label = document.querySelector(".zoom-label");
    if (label) label.textContent = `${Math.round((state.mindZoom || 1) * 100)}%`;
  }, { passive: false });

  svg.addEventListener("pointermove", (e) => {
    if (panning) {
      const pt = toRawSvgPoint(e);
      state.mindPan = { x: clamp(panBase.x + pt.x - panStart.x, -1100, 1100), y: clamp(panBase.y + pt.y - panStart.y, -760, 760) };
      const canvas = svg.querySelector("#mindCanvas");
      if (canvas) canvas.setAttribute("transform", `translate(${state.mindPan.x} ${state.mindPan.y}) scale(${state.mindZoom || 1})`);
      return;
    }
    if (dragging) {
      moved = true;
      const pt = toSvgPoint(e);
      const cur = state.mindPositions[dragging];
      const next = { ...cur, x: clamp(pt.x - offset.x, 90, 1810), y: clamp(pt.y - offset.y, 85, 1110) };
      state.mindPositions[dragging] = next;
      if (activeEl) activeEl.setAttribute("transform", `translate(${next.x} ${next.y})`);
    }
  });
  svg.addEventListener("pointerup", () => {
    if (dragging) renderMindmap();
    dragging = null;
    activeEl = null;
    panning = false;
    wrap.classList.remove("panning");
    svg.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  });
  svg.addEventListener("pointerleave", () => {
    if (dragging) renderMindmap();
    dragging = null;
    activeEl = null;
    panning = false;
    wrap.classList.remove("panning");
  });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

render();
