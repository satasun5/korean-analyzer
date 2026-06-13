import { analyzePassage, generateQuestions, explainSelection, askAboutQuestion, cleanupPassageWithAi, gradeShortAnswer, gradeShortAnswersBatch } from "./ai.js";
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

const MODEL_PRESETS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", tag: "저비용 기본", input: "가격표 확인", output: "가격표 확인", reasoning: false, note: "현재 입력창 기본값입니다. 계정에서 사용 가능해야 합니다." },
  { id: "gpt-5.4", label: "GPT-5.4", tag: "균형형", input: "$2.50 / 1M", output: "$15.00 / 1M", reasoning: true, note: "비용과 품질 균형. 공식 비교표 기준." },
  { id: "gpt-5.5", label: "GPT-5.5", tag: "고품질 추론", input: "$5.00 / 1M", output: "$30.00 / 1M", reasoning: true, note: "복잡한 지문 분석/출제에 적합. 비용 증가 주의." },
  { id: "gpt-5.5-pro", label: "GPT-5.5 Pro", tag: "최고가 전문", input: "$30.00 / 1M", output: "$180.00 / 1M", reasoning: true, note: "매우 비쌉니다. 꼭 필요한 경우만 사용하세요." },
  { id: "custom", label: "직접 입력", tag: "사용자 지정", input: "-", output: "-", reasoning: false, note: "계정에서 접근 가능한 모델명을 직접 입력합니다." }
];

const OCR_GUIDE = "OCR 지문은 문단 사이에 빈 줄 한 줄을 넣어 주세요. 문단 내부의 강제 줄바꿈은 [OCR 정리]로 한 문단 안에서 이어 붙일 수 있습니다.";


const state = {
  started: false,
  theme: loadSettings().theme || "light",
  tab: "summary",
  questionTab: "mc",
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
  records: loadRecords(),
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
  flash: null,
  userAnswers: { mc: {}, ox: {}, short: {} },
  revealAnswers: { mc: {}, ox: {}, short: {} },
  shortGrades: {},
  shortGradeLoading: {},
  qnaInputs: {},
  qnaMessages: {},
  qnaLoading: null,
  shortGradeConfirm: {},
  qnaOpen: {}
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
    demoMode: state.demoMode
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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
          <button class="btn small" id="questionBtn" ${state.analysis ? "" : "disabled"}>문제 제작</button>
        </div>
      </div>
      <div class="panel-body" data-scroll-key="reader">
        ${renderInputGuide(hasAnalysis)}
        ${state.loading && state.loading !== "questions" ? renderLoading() : ""}
        ${hasAnalysis ? renderHighlightFilters() : ""}
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
        <label>서술형 채점 모델 <small>기본 저비용</small></label>
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
  const steps = state.loading === "analysis"
    ? ["문단 분리", "띄어쓰기 정돈", "핵심 주장 탐색", "형광펜 설계", "마인드맵 구성", "학습 포인트 정리"]
    : state.loading === "note"
      ? ["선택 구절 확인", "앞뒤 문맥 연결", "쉬운 설명 작성", "시험 포인트 정리"]
      : state.loading === "cleanup"
        ? ["OCR 문장 확인", "띄어쓰기 정돈", "문단 보존", "지문 입력창 반영"]
        : ["출제 의도 설계", "선지별 정답/오답 이유 설계", "5지선다 구성", "OX 퀴즈 구성", "서술형 채점 기준 작성"];
  const activeIndex = Math.min(steps.length - 1, Math.floor((state.loadingProgress / 100) * steps.length));
  return `
    <div class="card loading-card-strong">
      <h3>${state.loading === "analysis" ? "분석 중이에요. 잠시만 기다려 주세요" : state.loading === "note" ? "메모 설명 생성 중" : state.loading === "cleanup" ? "AI 지문 정돈 중" : "문제 제작 중이에요. 잠시만 기다려 주세요"}</h3>
      <div class="progress"><span style="width:${state.loadingProgress}%"></span></div>
      <div class="loading-steps">
        ${steps.map((s, i) => `<div class="loading-step ${i === activeIndex ? "active" : ""}">${i <= activeIndex ? "✦" : "·"} ${s}</div>`).join("")}
      </div>
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
          ["summary", "요약"], ["structure", "구조"], ["concepts", "개념"], ["questions", "문제"], ["notes", "메모"], ["saved", "저장"]
        ].map(([id, label]) => `<button class="tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}
      </div>
      <div class="tab-content" data-scroll-key="analysis-tab">
        ${renderTabContent()}
      </div>
    </aside>`;
}

function renderTabContent() {
  if (!state.analysis && !["saved", "notes"].includes(state.tab)) {
    return `<div class="empty">아직 분석 결과가 없습니다.<br>지문을 넣고 <b>분석하기</b>를 눌러 주세요.</div>`;
  }
  if (state.tab === "summary") return renderSummaryTab();
  if (state.tab === "structure") return renderStructureTab();
  if (state.tab === "concepts") return renderConceptsTab();
  if (state.tab === "questions") return renderQuestionsTab();
  if (state.tab === "notes") return renderNotesTab();
  if (state.tab === "saved") return renderSavedTab();
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

function renderQuestionsTab() {
  if (state.loading === "questions") {
    return `<div class="kv"><div class="card question-loading-card">${renderLoading()}<p class="notice compact">문제를 제작 중이에요. 특히 선지별 정답/오답 이유를 먼저 설계하고 있어서 마지막 단계가 조금 오래 걸릴 수 있습니다.</p></div></div>`;
  }
  if (!state.questions) {
    return `<div class="empty">문제는 분석과 분리해서 생성합니다.<br><b>문제 제작</b> 버튼을 누르면 5지선다, OX, 서술형을 만듭니다.</div>`;
  }
  return `
    <div class="tabs" style="padding:0 0 10px;border:0">
      ${[["mc", "5지선다"], ["ox", "OX"], ["short", "서술형"]].map(([id, label]) => `<button class="tab ${state.questionTab === id ? "active" : ""}" data-qtab="${id}">${label}</button>`).join("")}
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
    ${messages.map((m) => `<div class="qna-message"><b>Q.</b> ${escapeHtml(m.question)}<br><b>A.</b> ${escapeHtml(m.answer)}${m.sourcePointer ? `<p><b>근거:</b> ${escapeHtml(m.sourcePointer)}</p>` : ""}</div>`).join("")}
  </div>`;
}

function renderWeakness() {
  return `<div class="kv">${(state.questions.weaknessGuide || []).map((w) => `<div class="card"><h3>${escapeHtml(w.weakness)}</h3><p><b>증상:</b> ${escapeHtml(w.symptom)}</p><p><b>개선:</b> ${escapeHtml(w.howToFix)}</p></div>`).join("")}</div>`;
}

function renderNotesTab() {
  return `<div class="kv">
    ${state.selectedText ? `<div class="card"><h4>선택한 구절</h4><p>“${escapeHtml(state.selectedText)}”</p><button class="btn primary full" id="explainSelectionBtn" style="margin-top:12px" ${state.noteLoading ? "disabled" : ""}>${state.noteLoading ? "설명 생성 중..." : "AI 설명 메모 만들기"}</button>${state.noteLoading ? `<div class="mini-loader"><span></span><b>앞뒤 문맥을 읽고 있습니다</b></div>` : ""}</div>` : `<div class="empty">지문에서 이해가 안 되는 부분을 드래그하면 이곳에 추가 설명을 만들 수 있습니다.</div>`}
    ${state.noteLoading && !state.selectedText ? `<div class="card"><div class="mini-loader"><span></span><b>AI 설명 메모를 생성 중입니다</b></div></div>` : ""}
    ${state.notes.map((n) => `<div class="card"><span class="badge">${escapeHtml(new Date(n.createdAt).toLocaleString())}</span><h4>“${escapeHtml(n.selectedText)}”</h4><p><b>쉽게:</b> ${escapeHtml(n.explanation.simple)}</p><p><b>문맥:</b> ${escapeHtml(n.explanation.context)}</p><p><b>시험:</b> ${escapeHtml(n.explanation.testPoint)}</p>${n.explanation.example ? `<p><b>예시:</b> ${escapeHtml(n.explanation.example)}</p>` : ""}</div>`).join("")}
  </div>`;
}

function renderSavedTab() {
  const records = state.records;
  if (!records.length) return `<div class="empty">저장된 분석이 없습니다.</div>`;
  return `<div class="saved-list">${records.map((r) => `<div class="card saved-item"><div><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(new Date(r.createdAt).toLocaleString())} · ${escapeHtml(r.field || "")}</p></div><div><button class="btn small" data-load-record="${r.id}">열기</button><button class="btn small danger" data-del-record="${r.id}">삭제</button></div></div>`).join("")}</div>`;
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
  const targetLabel = state.modelPickerTarget === "reasoning" ? "전문 추론 모델" : state.modelPickerTarget === "grading" ? "서술형 채점 모델" : "일반 분석 모델";
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
    state.selectedText = "";
    state.tab = "summary";
    state.questionTab = "mc";
    state.userAnswers = { mc: {}, ox: {}, short: {} };
    state.revealAnswers = { mc: {}, ox: {}, short: {} };
    state.shortGrades = {};
    state.qnaInputs = {};
    state.qnaMessages = {};
    state.qnaOpen = {};
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
      state.mindPositions = {};
      state.mindPan = { x: 0, y: 0 };
      state.mindZoom = 1;
      state.sampleActive = true;
      state.tab = "summary";
    }
    render();
  });
  document.querySelector("#saveBtn")?.addEventListener("click", saveCurrentRecord);
  document.querySelector("#analyzeBtn")?.addEventListener("click", runAnalysis);
  document.querySelector("#questionBtn")?.addEventListener("click", runQuestionGeneration);
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
  document.querySelectorAll("[data-del-record]").forEach((el) => el.addEventListener("click", () => { state.records = deleteRecord(el.dataset.delRecord); render(); }));
  document.querySelector("#closeDrawer")?.addEventListener("click", () => { state.detail = null; render(); });
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
}

async function runAnalysis() {
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
      state.analysis = createDemoAnalysis(state.passage);
      notify("info", "데모 모드 분석", "실제 API 호출 없이 샘플 분석 엔진으로 화면을 구성했습니다. 실제 분석은 데모 모드를 끄세요.");
    } else {
      state.analysis = await analyzePassage({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage
      });
      if (state.analysis?.cleanedPassage && state.analysis.cleanedPassage.length > 20) {
        state.passage = state.analysis.cleanedPassage.trim();
      }
    }
    state.questions = null;
    state.mindPositions = {};
    state.mindPan = { x: 0, y: 0 };
    state.mindZoom = 1;
    state.tab = "summary";
  } catch (error) {
    notify("error", "분석 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    clearInterval(timer);
    state.loading = null;
    state.loadingProgress = 100;
    render();
  }
}

async function runQuestionGeneration() {
  if (!state.analysis) return notify("error", "분석 결과가 없습니다", "먼저 지문 분석을 완료해 주세요.", "state.analysis is null");
  const apiKey = getApiKey();
  if (!state.demoMode && !apiKey) {
    notify("error", "API 키가 없습니다", "설정 메뉴에서 API 키를 붙여넣고 '키 적용'을 눌러 주세요.", "apiKey is empty and demoMode is off");
    return;
  }
  const timer = startProgress("questions");
  try {
    if (state.demoMode) {
      await delay(700);
      const demo = createDemoQuestions();
      const length = state.passage.length;
      const target = length > 2500 ? 20 : length > 1200 ? 12 : 6;
      while (demo.ox.length < target) {
        const i = demo.ox.length + 1;
        demo.ox.push({ id: `ox${i}`, statement: `복습용 진술 ${i}: 지문의 핵심 관점을 한쪽으로 단순화하면 오답이 되기 쉽다.`, answer: i % 2 ? "O" : "X", explanation: "데모 모드 예시입니다. 실제 API 사용 시 지문 기반으로 생성됩니다.", trap: "핵심어만 보고 판단하지 않기" });
      }
      state.questions = demo;
    } else {
      state.questions = await generateQuestions({
        apiKey,
        model: state.useReasoning ? state.reasoningModel : state.model,
        reasoningMode: state.useReasoning,
        reasoningEffort: state.reasoningEffort,
        passage: state.passage,
        analysis: state.analysis
      });
    }
    state.tab = "questions";
    state.questionTab = "mc";
  } catch (error) {
    notify("error", "문제 제작 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    clearInterval(timer);
    state.loading = null;
    render();
  }
}

async function runSelectionExplain() {
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
        simple: `“${selectedText}”은 글의 핵심 흐름에서 중요한 연결 고리입니다.`,
        context: "앞뒤 문단의 주장과 근거를 이어 주는 표현으로 보면 이해하기 쉽습니다.",
        testPoint: "선지에서 의미를 반대로 바꾸거나 범위를 과장하는 방식으로 출제될 수 있습니다.",
        example: "어떤 앱이 편리하지만 선택 폭을 줄이는 경우처럼, 장점과 한계를 함께 보라는 뜻입니다."
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
    state.notes.unshift({ id: uid("note"), selectedText, explanation, createdAt: Date.now() });
    state.selectedText = "";
    state.tab = "notes";
  } catch (error) {
    notify("error", "설명 생성 실패", error.message || "알 수 없는 오류가 발생했습니다.", error.stack || String(error));
  } finally {
    state.noteLoading = false;
    render();
  }
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
}

async function runShortAnswerGrade(id) {
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
}

function getQnaInput(key) {
  const el = Array.from(document.querySelectorAll("[data-qna-input]")).find((node) => node.dataset.qnaInput === key);
  const value = el?.value ?? state.qnaInputs[key] ?? "";
  state.qnaInputs[key] = value;
  return value.trim();
}

async function runQuestionAsk(key) {
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
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function saveCurrentRecord() {
  if (!state.analysis) return;
  const record = {
    id: uid("analysis"),
    title: state.analysis.title || "무제 분석",
    field: state.analysis.field || "",
    createdAt: Date.now(),
    passage: state.passage,
    analysis: state.analysis,
    questions: state.questions,
    notes: state.notes
  };
  state.records = saveRecord(record);
  state.tab = "saved";
  render();
}

function loadRecord(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;
  state.passage = record.passage;
  state.analysis = record.analysis;
  state.questions = record.questions;
  state.notes = record.notes || [];
  state.tab = "summary";
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
