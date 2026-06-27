import { loadRecords, loadSettings } from "./storage.js";
import { QUESTION_INSTRUCTIONS } from "./prompts.js";

const APP_KEY = "spark_korean_exam_builder_v1";
const API_KEY = "korean_ai_reader_openai_api_key";
const ENDPOINT = "https://api.openai.com/v1/responses";
const GITHUB_ISSUES = "https://github.com/satasun5/korean-analyzer/issues/new";
const MAX_ITEMS_PER_PASSAGE = 8;

const examRoot = document.createElement("section");
examRoot.id = "sparkExamBuilder";
document.body.append(examRoot);

const state = {
  open: false,
  view: "sources",
  entries: [],
  importedFiles: [],
  activePreview: "paper",
  previewOpen: false,
  terminal: { open: false, running: false, lines: [], title: "문항 제작 로그", error: null },
  diagnostics: [],
  detailEntryId: null,
  restored: false,
  busy: false,
  lastSavedAt: 0
};

function uid(prefix = "exam") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeJsonParse(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function clone(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanInline(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shorten(value = "", max = 100) {
  const text = cleanInline(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizePassage(value = "") {
  const raw = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return "";
  const paragraphs = raw
    .split(/\n\s*\n+/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean).join(" "))
    .map((block) => block.replace(/\s+([,.?!:;])/g, "$1").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);
  return paragraphs.join("\n\n");
}

function getRecordPassage(record = {}) {
  return normalizePassage(record?.analysis?.cleanedPassage || record?.passage || "");
}

function getRecordTitle(record = {}) {
  return cleanInline(record?.analysis?.title || record?.title || record?.name || "제목 없는 지문");
}

function getRecordField(record = {}) {
  return cleanInline(record?.analysis?.field || "국어 지문");
}

function getApiKey() {
  try { return String(sessionStorage.getItem(API_KEY) || "").replace(/\s+/g, "").trim(); } catch { return ""; }
}

function getModelSettings() {
  const settings = loadSettings?.() || {};
  const useReasoning = Boolean(settings.useReasoning);
  return {
    model: useReasoning ? (settings.reasoningModel || "gpt-5.5") : (settings.model || "gpt-4.1-mini"),
    reasoningMode: useReasoning,
    reasoningEffort: settings.reasoningEffort || "medium"
  };
}

function getExamSession() {
  return {
    kind: "spark-korean-exam-builder",
    version: "1.0",
    savedAt: new Date().toISOString(),
    entries: state.entries,
    importedFiles: state.importedFiles,
    view: state.view,
    activePreview: state.activePreview
  };
}

function persist() {
  const payload = getExamSession();
  try {
    localStorage.setItem(APP_KEY, JSON.stringify(payload));
    state.lastSavedAt = Date.now();
  } catch (error) {
    addDiagnostic("저장 실패", error?.message || String(error), "localStorage 공간 또는 브라우저 보호 설정을 확인하세요.");
  }
}

function restore() {
  const saved = safeJsonParse(localStorage.getItem(APP_KEY), null);
  if (!saved || saved.kind !== "spark-korean-exam-builder") return false;
  state.entries = Array.isArray(saved.entries) ? saved.entries.map(normalizeEntry).filter((entry) => entry.passage) : [];
  state.importedFiles = Array.isArray(saved.importedFiles) ? saved.importedFiles : [];
  state.view = ["sources", "build", "paper", "solutions", "archive"].includes(saved.view) ? saved.view : "sources";
  state.activePreview = saved.activePreview === "solutions" ? "solutions" : "paper";
  state.restored = true;
  return true;
}

function clearSession() {
  try { localStorage.removeItem(APP_KEY); } catch { /* noop */ }
}

function normalizeEntry(raw = {}) {
  const record = raw.record || raw;
  const passage = normalizePassage(raw.passage || getRecordPassage(record));
  return {
    id: raw.id || uid("passage"),
    sourceId: raw.sourceId || "browser",
    sourceLabel: raw.sourceLabel || "웹사이트 저장본",
    recordId: raw.recordId || record.id || uid("record"),
    title: cleanInline(raw.title || getRecordTitle(record)),
    field: cleanInline(raw.field || getRecordField(record)),
    passage,
    analysis: raw.analysis || record.analysis || null,
    selected: raw.selected !== false,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : Date.now(),
    questionCount: clamp(Number(raw.questionCount ?? 4), 1, MAX_ITEMS_PER_PASSAGE),
    status: raw.status || "대기",
    error: raw.error || "",
    set: raw.set || null,
    importedAt: raw.importedAt || new Date().toISOString()
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

function sortedEntries({ selectedOnly = false } = {}) {
  return state.entries
    .filter((entry) => !selectedOnly || entry.selected)
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order));
}

function selectedQuestionSets() {
  return sortedEntries({ selectedOnly: true }).filter((entry) => entry.set?.items?.length);
}

function addDiagnostic(title, message, guide = "") {
  state.diagnostics.unshift({ id: uid("diag"), title, message, guide, at: new Date().toISOString() });
  state.diagnostics = state.diagnostics.slice(0, 20);
  persist();
}

function terminalLine(text, kind = "info") {
  const stamp = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  state.terminal.lines.push({ stamp, text: String(text || ""), kind });
  if (state.terminal.lines.length > 420) state.terminal.lines.splice(0, state.terminal.lines.length - 420);
  const panel = document.querySelector("#examTerminalLines");
  if (panel) {
    const line = document.createElement("div");
    line.className = `exam-terminal-line ${kind}`;
    line.textContent = `[${stamp}] ${text}`;
    panel.append(line);
    panel.scrollTop = panel.scrollHeight;
  }
}

function openTerminal(title = "문항 제작 로그") {
  state.terminal = { open: true, running: true, title, lines: [], error: null };
  render();
}

function closeTerminal() {
  state.terminal.open = false;
  state.terminal.running = false;
  render();
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
  #sparkExamBuilder { position:fixed; inset:0; z-index:1000; pointer-events:none; font-family: Pretendard, "Noto Sans KR", Arial, sans-serif; color:#1d2939; }
  #sparkExamBuilder .exam-builder { display:none; pointer-events:auto; position:absolute; inset:0; overflow:auto; background:linear-gradient(145deg,#f8fbff 0%,#edf5ff 52%,#f8f7ff 100%); }
  #sparkExamBuilder.open .exam-builder { display:block; }
  .exam-builder * { box-sizing:border-box; }
  .exam-shell { width:min(1500px,100%); margin:0 auto; padding:22px clamp(14px,3vw,42px) 80px; }
  .exam-head { position:sticky; top:0; z-index:25; display:flex; gap:18px; align-items:center; justify-content:space-between; padding:14px 0 18px; background:linear-gradient(180deg,#f8fbff 72%,rgba(248,251,255,0)); }
  .exam-brand { display:flex; align-items:center; gap:12px; }
  .exam-brand-mark { display:grid; place-items:center; width:42px; height:42px; border-radius:14px; color:#fff; font-size:20px; font-weight:900; background:linear-gradient(135deg,#4f46e5,#06b6d4); box-shadow:0 12px 30px rgba(79,70,229,.25); }
  .exam-brand h1 { margin:0; font-size:22px; letter-spacing:-.05em; }
  .exam-brand p { margin:3px 0 0; color:#64748b; font-size:12px; }
  .exam-head-actions, .exam-tool-row, .exam-inline-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .exam-btn { border:1px solid rgba(100,116,139,.22); background:#fff; color:#263448; border-radius:12px; padding:9px 12px; font:inherit; font-weight:800; font-size:13px; cursor:pointer; transition:.18s ease; }
  .exam-btn:hover { transform:translateY(-1px); border-color:rgba(79,70,229,.42); box-shadow:0 9px 20px rgba(79,70,229,.12); }
  .exam-btn.primary { color:#fff; border-color:transparent; background:linear-gradient(135deg,#4f46e5,#06b6d4); }
  .exam-btn.danger { color:#d92d20; border-color:rgba(217,45,32,.22); }
  .exam-btn.small { padding:7px 9px; font-size:12px; }
  .exam-btn:disabled { opacity:.45; cursor:not-allowed; transform:none; box-shadow:none; }
  .exam-nav { display:flex; gap:7px; padding:8px; border:1px solid rgba(99,102,241,.15); background:rgba(255,255,255,.7); border-radius:16px; box-shadow:0 10px 30px rgba(51,65,85,.06); overflow:auto; }
  .exam-nav button { white-space:nowrap; border:0; background:transparent; color:#64748b; font:inherit; font-weight:800; padding:9px 12px; border-radius:10px; cursor:pointer; }
  .exam-nav button.active { background:#fff; color:#4338ca; box-shadow:0 4px 13px rgba(79,70,229,.12); }
  .exam-layout { margin-top:16px; display:grid; gap:16px; }
  .exam-card { border:1px solid rgba(100,116,139,.18); background:rgba(255,255,255,.88); border-radius:22px; padding:18px; box-shadow:0 18px 55px rgba(31,41,55,.07); }
  .exam-card h2, .exam-card h3 { margin:0; letter-spacing:-.04em; }
  .exam-card h2 { font-size:18px; }
  .exam-card h3 { font-size:15px; }
  .exam-card p { color:#64748b; line-height:1.65; }
  .exam-source-toolbar { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:14px; }
  .exam-source-grid { margin-top:14px; display:grid; grid-template-columns:repeat(auto-fill,minmax(285px,1fr)); gap:11px; }
  .exam-source-entry { position:relative; border:1px solid rgba(100,116,139,.18); background:#fff; border-radius:16px; padding:14px; transition:.18s ease; }
  .exam-source-entry.selected { border-color:rgba(79,70,229,.55); box-shadow:0 10px 26px rgba(79,70,229,.11); }
  .exam-entry-top { display:flex; gap:10px; align-items:flex-start; }
  .exam-entry-top input { accent-color:#4f46e5; width:17px; height:17px; margin-top:3px; }
  .exam-entry-title { min-width:0; flex:1; }
  .exam-entry-title b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .exam-meta { margin-top:3px; color:#64748b; font-size:11px; }
  .exam-entry-summary { margin:10px 0; min-height:44px; color:#475569; font-size:12px; line-height:1.55; }
  .exam-count { display:inline-flex; align-items:center; gap:7px; border:1px solid rgba(100,116,139,.2); border-radius:10px; padding:6px 8px; font-size:12px; font-weight:800; }
  .exam-count input { width:42px; border:0; outline:0; font:inherit; text-align:center; background:transparent; }
  .exam-order { display:flex; gap:5px; }
  .exam-order button { border:1px solid rgba(100,116,139,.18); background:#f8fafc; width:27px; height:27px; border-radius:8px; cursor:pointer; }
  .exam-detail { margin-top:10px; padding:12px; max-height:240px; overflow:auto; border-radius:12px; background:#f8fafc; border:1px solid rgba(100,116,139,.13); white-space:pre-wrap; line-height:1.72; font-size:12px; }
  .exam-empty { padding:46px 20px; text-align:center; color:#64748b; border:1px dashed rgba(100,116,139,.28); border-radius:18px; }
  .exam-build-grid { display:grid; grid-template-columns:minmax(360px,.8fr) minmax(0,1.2fr); gap:16px; }
  .exam-selected-list { display:grid; gap:9px; margin-top:12px; }
  .exam-selected-row { display:grid; grid-template-columns:38px minmax(0,1fr) auto; gap:10px; align-items:center; padding:11px; border:1px solid rgba(100,116,139,.14); border-radius:13px; background:#fff; }
  .exam-selected-row .order { display:grid; place-items:center; width:28px; height:28px; border-radius:9px; background:#eef2ff; color:#4f46e5; font-weight:900; font-size:12px; }
  .exam-status { display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:5px 8px; font-size:11px; font-weight:800; background:#eff6ff; color:#2563eb; }
  .exam-status.done { background:#ecfdf3; color:#027a48; }.exam-status.error { background:#fef3f2; color:#b42318; }.exam-status.wait { background:#f8fafc; color:#64748b; }
  .exam-table-wrap { overflow:auto; margin-top:12px; border:1px solid rgba(100,116,139,.15); border-radius:15px; }
  .exam-table { width:100%; border-collapse:collapse; min-width:760px; font-size:12px; }
  .exam-table th { text-align:left; background:#f8fafc; color:#64748b; font-size:11px; letter-spacing:.02em; }
  .exam-table th,.exam-table td { padding:10px; border-bottom:1px solid rgba(100,116,139,.12); vertical-align:top; }
  .exam-table tr:last-child td { border-bottom:0; }
  .exam-table td input { accent-color:#4f46e5; }
  .exam-type { display:inline-block; padding:4px 7px; background:#eef2ff; border-radius:7px; color:#4338ca; font-size:11px; font-weight:800; }
  .exam-preview-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
  .exam-preview-frame { width:100%; height:min(78vh,980px); border:1px solid rgba(100,116,139,.2); border-radius:16px; background:#fff; }
  .exam-terminal-backdrop, .exam-modal-backdrop { position:fixed; inset:0; z-index:80; background:rgba(15,23,42,.42); backdrop-filter:blur(5px); display:grid; place-items:center; padding:16px; }
  .exam-terminal { width:min(990px,100%); max-height:min(84vh,780px); display:flex; flex-direction:column; border:1px solid rgba(148,163,184,.35); border-radius:18px; overflow:hidden; background:#0b1220; color:#dbeafe; box-shadow:0 32px 100px rgba(2,6,23,.52); }
  .exam-terminal-head { display:flex; justify-content:space-between; align-items:center; padding:13px 15px; background:#111c31; border-bottom:1px solid rgba(148,163,184,.16); }
  .exam-terminal-head b { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; }
  .exam-terminal-head span { color:#7dd3fc; font-size:11px; }
  #examTerminalLines { min-height:360px; max-height:58vh; overflow:auto; padding:14px; white-space:pre-wrap; font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .exam-terminal-line { color:#cbd5e1; }.exam-terminal-line.error { color:#fca5a5; }.exam-terminal-line.success { color:#86efac; }.exam-terminal-line.delta { color:#93c5fd; }
  .exam-terminal-foot { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; padding:12px 14px; border-top:1px solid rgba(148,163,184,.16); background:#111c31; }
  .exam-modal { width:min(940px,100%); max-height:85vh; overflow:auto; padding:18px; border-radius:20px; background:#fff; box-shadow:0 30px 90px rgba(15,23,42,.35); }
  .exam-modal-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:12px; }
  .exam-diagnostics { display:grid; gap:10px; }.exam-diag { padding:12px; border:1px solid rgba(100,116,139,.16); border-radius:13px; background:#f8fafc; }.exam-diag b { display:block; }.exam-diag p { margin:5px 0; font-size:12px; }.exam-diag small { color:#64748b; }
  .exam-float-launch { display:none; }
  .exam-builder-launcher { margin-right:2px; }
  @media(max-width:980px){.exam-build-grid{grid-template-columns:1fr}.exam-head{align-items:flex-start}.exam-head-actions{justify-content:flex-end}.exam-shell{padding:14px 12px 64px}.exam-source-grid{grid-template-columns:1fr}.exam-preview-frame{height:72vh}}
  @media(max-width:620px){.exam-head{position:static}.exam-brand h1{font-size:18px}.exam-head-actions .exam-btn{padding:8px}.exam-nav{padding:5px}.exam-nav button{padding:8px}.exam-float-launch{display:block;position:fixed;right:14px;bottom:16px;z-index:60}.exam-terminal{max-height:92vh}.exam-terminal-backdrop{padding:8px}}
  `;
  document.head.append(style);
}

function attachLauncher() {
  const attach = () => {
    const actionTargets = [...document.querySelectorAll(".top-actions, .intro-actions")];
    actionTargets.forEach((target) => {
      if (target.querySelector(".exam-builder-launcher")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn small exam-builder-launcher";
      button.textContent = "시험지 제작";
      button.title = "저장 지문으로 객관식 시험지를 제작합니다";
      button.addEventListener("click", openBuilder);
      target.prepend(button);
    });
  };
  const observer = new MutationObserver(attach);
  observer.observe(document.body, { childList: true, subtree: true });
  attach();
}

function openBuilder() {
  state.open = true;
  if (!state.entries.length) loadBrowserRecords({ append: false, silent: true });
  render();
}

function closeBuilder() {
  persist();
  state.open = false;
  state.previewOpen = false;
  render();
}

function render() {
  examRoot.className = state.open ? "open" : "";
  examRoot.innerHTML = `
    <div class="exam-builder" role="dialog" aria-modal="true" aria-label="시험지 제작">
      <div class="exam-shell">
        <header class="exam-head">
          <div class="exam-brand"><div class="exam-brand-mark">문</div><div><h1>반짝국어 시험지 제작</h1><p>저장된 여러 지문을 골라 고난도 객관식 시험지와 해설지를 만듭니다.</p></div></div>
          <div class="exam-head-actions">
            <span class="exam-status ${getApiKey() ? "done" : "error"}">${getApiKey() ? "API 키 연결됨" : "API 키 필요"}</span>
            <button class="exam-btn small" data-action="save-session">작업 저장</button>
            <button class="exam-btn small" data-action="close">분석기로</button>
          </div>
        </header>
        <nav class="exam-nav">
          ${navButton("sources", "지문 불러오기")}
          ${navButton("build", "문항 제작")}
          ${navButton("paper", "시험지 미리보기")}
          ${navButton("solutions", "해설지 미리보기")}
          ${navButton("archive", "저장·내보내기")}
        </nav>
        <main class="exam-layout">${renderView()}</main>
      </div>
      <button class="exam-btn primary exam-float-launch" data-action="close">분석기로</button>
      ${renderTerminal()}
      ${renderDetailModal()}
    </div>`;
  attachEvents();
}

function navButton(view, label) {
  return `<button data-view="${view}" class="${state.view === view ? "active" : ""}">${label}</button>`;
}

function renderView() {
  if (state.view === "build") return renderBuildView();
  if (state.view === "paper") return renderPreviewView("paper");
  if (state.view === "solutions") return renderPreviewView("solutions");
  if (state.view === "archive") return renderArchiveView();
  return renderSourceView();
}

function renderSourceView() {
  const selected = sortedEntries({ selectedOnly: true }).length;
  return `<section class="exam-card">
    <div class="exam-inline-actions" style="justify-content:space-between"><div><h2>지문 불러오기</h2><p>웹사이트에 저장된 분석본이나 외부 JSON을 여러 개 불러온 뒤, 시험지에 넣을 지문을 선택하세요.</p></div><span class="exam-status ${selected ? "done" : "wait"}">선택된 지문 ${selected}개</span></div>
    ${state.restored ? `<div class="exam-diag" style="margin-top:12px"><b>이전 시험지 작업을 복원했습니다.</b><p>선택한 지문, 생성된 문항, 순서와 제외 상태가 브라우저에 저장되어 있습니다.</p></div>` : ""}
    <div class="exam-source-toolbar">
      <div class="exam-tool-row"><button class="exam-btn primary" data-action="load-browser">웹사이트 저장본 불러오기</button><button class="exam-btn" data-action="choose-record-files">JSON 파일 여러 개 추가</button><input id="examRecordFiles" type="file" accept="application/json,.json" multiple hidden /></div>
      <div class="exam-tool-row"><button class="exam-btn small" data-action="select-all">전체 선택</button><button class="exam-btn small" data-action="deselect-all">전체 해제</button><button class="exam-btn small danger" data-action="clear-imports">외부 파일 비우기</button></div>
    </div>
    ${state.entries.length ? `<div class="exam-source-grid">${state.entries.map(renderSourceEntry).join("")}</div>` : `<div class="exam-empty">아직 불러온 지문이 없습니다.<br/>웹사이트 저장본 또는 반짝국어 저장 JSON 파일을 추가해 주세요.</div>`}
  </section>`;
}

function renderSourceEntry(entry) {
  const index = sortedEntries({ selectedOnly: true }).findIndex((item) => item.id === entry.id) + 1;
  return `<article class="exam-source-entry ${entry.selected ? "selected" : ""}">
    <div class="exam-entry-top"><input type="checkbox" data-select-entry="${entry.id}" ${entry.selected ? "checked" : ""}/><div class="exam-entry-title"><b title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</b><div class="exam-meta">${escapeHtml(entry.field)} · ${escapeHtml(entry.sourceLabel)}</div></div><span class="exam-status ${entry.status === "완료" ? "done" : entry.status === "오류" ? "error" : "wait"}">${escapeHtml(entry.status)}</span></div>
    <p class="exam-entry-summary">${escapeHtml(shorten(entry.analysis?.overallSummary || entry.passage, 130))}</p>
    <div class="exam-inline-actions" style="justify-content:space-between"><label class="exam-count">문항 <input type="number" min="1" max="${MAX_ITEMS_PER_PASSAGE}" value="${entry.questionCount}" data-count-entry="${entry.id}" /> / ${MAX_ITEMS_PER_PASSAGE}</label><div class="exam-order">${entry.selected ? `<button title="위로" data-move-entry="${entry.id}" data-direction="up">↑</button><button title="아래로" data-move-entry="${entry.id}" data-direction="down">↓</button><span class="exam-status">${index}번 지문</span>` : ""}</div></div>
    <div class="exam-inline-actions" style="margin-top:10px"><button class="exam-btn small" data-detail-entry="${entry.id}">상세 정보 보기</button>${entry.status === "오류" ? `<button class="exam-btn small" data-regenerate-entry="${entry.id}">이 지문 재시도</button>` : ""}</div>
    ${entry.error ? `<div class="exam-entry-summary" style="color:#b42318">${escapeHtml(shorten(entry.error, 170))}</div>` : ""}
  </article>`;
}

function renderBuildView() {
  const chosen = sortedEntries({ selectedOnly: true });
  const completed = chosen.filter((entry) => entry.set?.items?.length).length;
  return `<div class="exam-build-grid">
    <section class="exam-card"><h2>시험 순서와 지문별 문항 수</h2><p>모든 문항은 최고 난이도로 제작됩니다. 문항 수가 적을수록 문단 결합·보기 적용·의미 추론에 더 집중하도록 요청합니다.</p>
      ${chosen.length ? `<div class="exam-selected-list">${chosen.map((entry, i) => `<div class="exam-selected-row"><span class="order">${i + 1}</span><div><b>${escapeHtml(entry.title)}</b><div class="exam-meta">${escapeHtml(entry.field)} · ${entry.questionCount}문항 · ${escapeHtml(entry.status)}</div></div><div class="exam-inline-actions"><button class="exam-btn small" data-move-entry="${entry.id}" data-direction="up">↑</button><button class="exam-btn small" data-move-entry="${entry.id}" data-direction="down">↓</button></div></div>`).join("")}</div>` : `<div class="exam-empty">먼저 지문 불러오기에서 시험에 넣을 지문을 선택하세요.</div>`}
      <div class="exam-inline-actions" style="margin-top:16px"><button class="exam-btn primary" data-action="generate-selected" ${chosen.length && !state.busy ? "" : "disabled"}>선택 지문별 객관식 문항 제작</button><button class="exam-btn" data-action="open-terminal" ${state.terminal.lines.length ? "" : "disabled"}>제작 로그 보기</button></div>
      <p class="exam-meta">진행 상태: ${completed}/${chosen.length}개 지문 문항 세트 완료. 중간 오류나 결제 한도 오류가 나면 완료된 세트는 즉시 저장되고 이후 호출은 멈춥니다.</p>
    </section>
    <section class="exam-card"><h2>문항 세트 관리</h2><p>제작된 객관식 문항을 한눈에 보고, 시험지에서 뺄 문항은 체크를 해제하세요.</p>${renderItemTable()}</section>
  </div>`;
}

function renderItemTable() {
  const sets = selectedQuestionSets();
  if (!sets.length) return `<div class="exam-empty">아직 제작된 문항이 없습니다.</div>`;
  let number = 0;
  const rows = [];
  for (const entry of sets) {
    for (const item of entry.set.items) {
      number += 1;
      const included = item.included !== false;
      rows.push(`<tr><td><input type="checkbox" data-toggle-item="${entry.id}|${item.id}" ${included ? "checked" : ""}/></td><td>${number}</td><td><b>${escapeHtml(entry.title)}</b><br/><span class="exam-meta">${escapeHtml(entry.field)}</span></td><td><span class="exam-type">${escapeHtml(item.type)}</span></td><td>${escapeHtml(shorten(item.question, 92))}</td><td><button class="exam-btn small" data-image-item="${entry.id}|${item.id}">이미지</button></td></tr>`);
    }
  }
  return `<div class="exam-table-wrap"><table class="exam-table"><thead><tr><th>포함</th><th>순번</th><th>지문</th><th>유형</th><th>문항</th><th>저장</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderPreviewView(kind) {
  const available = selectedQuestionSets().flatMap((entry) => entry.set.items.filter((item) => item.included !== false));
  const hasItems = available.length > 0;
  const html = kind === "solutions" ? buildSolutionsHtml() : buildPaperHtml();
  return `<section class="exam-card"><div class="exam-preview-toolbar"><div><h2>${kind === "solutions" ? "해설지 미리보기" : "시험지 미리보기"}</h2><p>2026 수능형 2단 레이아웃을 참고해 지문을 먼저 배치하고 이어서 연결 문항을 제시합니다.</p></div><div class="exam-inline-actions"><button class="exam-btn" data-action="print-${kind}" ${hasItems ? "" : "disabled"}>${kind === "solutions" ? "해설지 인쇄 / PDF 저장" : "시험지 인쇄 / PDF 저장"}</button><button class="exam-btn small" data-action="download-${kind}-html" ${hasItems ? "" : "disabled"}>HTML 저장</button></div></div>${hasItems ? `<iframe class="exam-preview-frame" title="${kind === "solutions" ? "해설지" : "시험지"} 미리보기" srcdoc="${escapeHtml(html)}"></iframe>` : `<div class="exam-empty">제작을 완료한 문항 세트가 있어야 미리보기할 수 있습니다.</div>`}</section>`;
}

function renderArchiveView() {
  const hasSession = state.entries.length > 0;
  return `<section class="exam-card"><h2>시험지 작업 저장·내보내기</h2><p>지문, 분석 요약, 제작 문항, 포함 여부, 시험 순서를 하나의 시험지 작업 파일로 저장합니다.</p><div class="exam-tool-row" style="margin-top:12px"><button class="exam-btn primary" data-action="export-session" ${hasSession ? "" : "disabled"}>시험지 작업 JSON 내보내기</button><button class="exam-btn" data-action="choose-exam-file">시험지 작업 불러오기</button><input id="examSessionFile" type="file" accept="application/json,.json" hidden /><button class="exam-btn" data-action="save-session">브라우저에 즉시 저장</button><button class="exam-btn danger" data-action="clear-session">현재 시험지 작업 비우기</button></div><div class="exam-diag" style="margin-top:18px"><b>트러블슈팅</b><p>API 오류, 결제 한도, JSON 파싱 오류가 발생하면 로그와 함께 완료된 작업이 자동 보존됩니다.</p><div class="exam-inline-actions"><button class="exam-btn small" data-action="open-terminal" ${state.terminal.lines.length ? "" : "disabled"}>제작 로그</button><button class="exam-btn small" data-action="diagnostics">진단 기록</button><button class="exam-btn small" data-action="github-issue">GitHub 이슈 초안</button></div></div></section>`;
}

function renderTerminal() {
  if (!state.terminal.open) return "";
  return `<div class="exam-terminal-backdrop"><section class="exam-terminal"><div class="exam-terminal-head"><div><b>${escapeHtml(state.terminal.title)}</b><br/><span>${state.terminal.running ? "호출 상태를 실시간으로 받는 중입니다." : "로그가 저장되었습니다."}</span></div><button class="exam-btn small" data-action="close-terminal" ${state.terminal.running ? "disabled" : ""}>닫기</button></div><div id="examTerminalLines">${state.terminal.lines.map((line) => `<div class="exam-terminal-line ${line.kind}">[${escapeHtml(line.stamp)}] ${escapeHtml(line.text)}</div>`).join("")}</div><div class="exam-terminal-foot"><div class="exam-inline-actions"><button class="exam-btn small" data-action="copy-terminal">로그 복사</button><button class="exam-btn small" data-action="github-issue">GitHub 이슈 초안</button></div>${state.terminal.running ? `<span class="exam-status">제작 진행 중</span>` : `<button class="exam-btn primary" data-action="close-terminal">${selectedQuestionSets().length ? "시험지 미리보기" : "닫기"}</button>`}</div></section></div>`;
}

function renderDetailModal() {
  const entry = state.entries.find((item) => item.id === state.detailEntryId);
  if (!entry) return "";
  return `<div class="exam-modal-backdrop"><section class="exam-modal"><div class="exam-modal-head"><div><h2>${escapeHtml(entry.title)}</h2><p>${escapeHtml(entry.field)} · ${escapeHtml(entry.sourceLabel)}</p></div><button class="exam-btn small" data-action="close-detail">닫기</button></div><div class="exam-detail" style="max-height:66vh">${escapeHtml(entry.passage)}</div>${entry.analysis?.overallSummary ? `<div class="exam-diag" style="margin-top:12px"><b>분석 요약</b><p>${escapeHtml(entry.analysis.overallSummary)}</p></div>` : ""}</section></div>`;
}

function attachEvents() {
  examRoot.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; persist(); render(); }));
  examRoot.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => runAction(button.dataset.action)));
  examRoot.querySelectorAll("[data-select-entry]").forEach((input) => input.addEventListener("change", () => {
    const entry = state.entries.find((item) => item.id === input.dataset.selectEntry);
    if (entry) { entry.selected = input.checked; if (input.checked && !Number.isFinite(Number(entry.order))) entry.order = Date.now(); persist(); render(); }
  }));
  examRoot.querySelectorAll("[data-count-entry]").forEach((input) => input.addEventListener("change", () => {
    const entry = state.entries.find((item) => item.id === input.dataset.countEntry);
    if (entry) { entry.questionCount = clamp(input.value, 1, MAX_ITEMS_PER_PASSAGE); entry.set = null; entry.status = "대기"; persist(); render(); }
  }));
  examRoot.querySelectorAll("[data-move-entry]").forEach((button) => button.addEventListener("click", () => moveEntry(button.dataset.moveEntry, button.dataset.direction)));
  examRoot.querySelectorAll("[data-detail-entry]").forEach((button) => button.addEventListener("click", () => { state.detailEntryId = button.dataset.detailEntry; render(); }));
  examRoot.querySelectorAll("[data-regenerate-entry]").forEach((button) => button.addEventListener("click", () => generateEntries([button.dataset.regenerateEntry])));
  examRoot.querySelectorAll("[data-toggle-item]").forEach((input) => input.addEventListener("change", () => toggleItem(input.dataset.toggleItem, input.checked)));
  examRoot.querySelectorAll("[data-image-item]").forEach((button) => button.addEventListener("click", () => downloadItemImage(button.dataset.imageItem)));
  const files = examRoot.querySelector("#examRecordFiles");
  if (files) files.addEventListener("change", (event) => importRecordFiles(event.target.files));
  const sessionFile = examRoot.querySelector("#examSessionFile");
  if (sessionFile) sessionFile.addEventListener("change", (event) => importExamSession(event.target.files?.[0]));
}

function runAction(action) {
  if (action === "close") return closeBuilder();
  if (action === "load-browser") return loadBrowserRecords({ append: true });
  if (action === "choose-record-files") return examRoot.querySelector("#examRecordFiles")?.click();
  if (action === "choose-exam-file") return examRoot.querySelector("#examSessionFile")?.click();
  if (action === "select-all") { state.entries.forEach((entry) => { entry.selected = true; }); persist(); render(); return; }
  if (action === "deselect-all") { state.entries.forEach((entry) => { entry.selected = false; }); persist(); render(); return; }
  if (action === "clear-imports") { state.entries = state.entries.filter((entry) => entry.sourceId === "browser"); state.importedFiles = []; persist(); render(); return; }
  if (action === "generate-selected") return generateEntries();
  if (action === "open-terminal") { state.terminal.open = true; render(); return; }
  if (action === "close-terminal") { state.terminal.open = false; state.terminal.running = false; if (selectedQuestionSets().length) state.view = "paper"; render(); return; }
  if (action === "copy-terminal") return copyText(state.terminal.lines.map((line) => `[${line.stamp}] ${line.text}`).join("\n"), "제작 로그를 복사했습니다.");
  if (action === "save-session") { persist(); toast("시험지 작업을 저장했습니다."); return; }
  if (action === "export-session") return exportSession();
  if (action === "clear-session") return clearCurrentSession();
  if (action === "print-paper") return openPrintWindow("paper");
  if (action === "print-solutions") return openPrintWindow("solutions");
  if (action === "download-paper-html") return downloadText("반짝국어_시험지.html", buildPaperHtml(), "text/html;charset=utf-8");
  if (action === "download-solutions-html") return downloadText("반짝국어_해설지.html", buildSolutionsHtml(), "text/html;charset=utf-8");
  if (action === "close-detail") { state.detailEntryId = null; render(); return; }
  if (action === "diagnostics") return showDiagnostics();
  if (action === "github-issue") return openGithubIssue();
}

function toast(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = "position:fixed;z-index:1100;right:18px;bottom:18px;padding:12px 15px;border-radius:13px;background:#1e293b;color:white;box-shadow:0 14px 36px rgba(15,23,42,.25);font:13px system-ui;";
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

function loadBrowserRecords({ append = true, silent = false } = {}) {
  const records = Array.isArray(loadRecords?.()) ? loadRecords() : [];
  if (!append) state.entries = [];
  let added = 0;
  for (const record of records) {
    const id = `browser:${record.id || getRecordTitle(record)}`;
    if (state.entries.some((entry) => entry.sourceId === "browser" && entry.recordId === record.id)) continue;
    const entry = normalizeEntry({ id: uid("browser"), sourceId: "browser", sourceLabel: "웹사이트 저장본", recordId: record.id || id, record, selected: false, order: state.entries.length + 1 });
    if (!entry.passage) continue;
    state.entries.push(entry);
    added += 1;
  }
  persist();
  if (!silent) toast(`${added}개 저장 지문을 불러왔습니다.`);
  render();
}

async function importRecordFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let added = 0;
  for (const file of files) {
    try {
      const parsed = safeJsonParse(await file.text(), null);
      if (!parsed) throw new Error("JSON 형식이 아닙니다.");
      if (parsed.kind === "spark-korean-exam-builder") {
        await restoreSessionObject(parsed, { merge: true, label: file.name });
        continue;
      }
      const records = extractRecordsFromImport(parsed);
      if (!records.length) throw new Error("반짝국어 저장본(records) 또는 지문 레코드를 찾지 못했습니다.");
      for (const record of records) {
        const recordId = record.id || uid("importRecord");
        if (state.entries.some((entry) => entry.sourceLabel === file.name && entry.recordId === recordId)) continue;
        const entry = normalizeEntry({ id: uid("import"), sourceId: `file:${file.name}`, sourceLabel: file.name, recordId, record, selected: true, order: Date.now() + state.entries.length });
        if (entry.passage) { state.entries.push(entry); added += 1; }
      }
      state.importedFiles.push({ name: file.name, importedAt: new Date().toISOString(), count: records.length });
    } catch (error) {
      addDiagnostic("저장 파일 불러오기 실패", `${file.name}: ${error.message || error}`, "파일이 반짝국어 저장 JSON인지, 다운로드가 중간에 끊기지 않았는지 확인하세요.");
    }
  }
  persist();
  toast(`${added}개 지문을 추가했습니다.`);
  render();
}

function extractRecordsFromImport(parsed) {
  if (Array.isArray(parsed?.records)) return parsed.records;
  if (Array.isArray(parsed)) return parsed;
  if (parsed?.passage || parsed?.analysis?.cleanedPassage) return [parsed];
  return [];
}

async function importExamSession(file) {
  if (!file) return;
  try {
    const parsed = safeJsonParse(await file.text(), null);
    if (!parsed || parsed.kind !== "spark-korean-exam-builder") throw new Error("시험지 작업 파일 형식이 아닙니다.");
    await restoreSessionObject(parsed, { merge: false, label: file.name });
    toast("시험지 작업을 복원했습니다.");
  } catch (error) {
    addDiagnostic("시험지 작업 불러오기 실패", error.message || String(error), "반짝국어 시험지 작업 JSON인지 확인하세요.");
    toast("불러오기에 실패했습니다. 진단 기록을 확인하세요.");
  }
}

async function restoreSessionObject(payload, { merge = false, label = "" } = {}) {
  const entries = Array.isArray(payload.entries) ? payload.entries.map(normalizeEntry).filter((entry) => entry.passage) : [];
  if (merge) {
    const existingKeys = new Set(state.entries.map((entry) => `${entry.sourceLabel}|${entry.recordId}`));
    entries.forEach((entry) => { if (!existingKeys.has(`${entry.sourceLabel}|${entry.recordId}`)) state.entries.push(entry); });
  } else {
    state.entries = entries;
    state.importedFiles = Array.isArray(payload.importedFiles) ? payload.importedFiles : [];
    state.view = payload.view || "sources";
    state.activePreview = payload.activePreview || "paper";
  }
  if (label) state.importedFiles.push({ name: label, importedAt: new Date().toISOString(), count: entries.length, kind: "시험지 작업" });
  persist();
  render();
}

function moveEntry(id, direction) {
  const list = sortedEntries({ selectedOnly: true });
  const index = list.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= list.length) return;
  const a = list[index];
  const b = list[targetIndex];
  const temp = a.order;
  a.order = b.order;
  b.order = temp;
  persist();
  render();
}

function toggleItem(key, included) {
  const [entryId, itemId] = key.split("|");
  const entry = state.entries.find((item) => item.id === entryId);
  const item = entry?.set?.items?.find((question) => question.id === itemId);
  if (!item) return;
  item.included = included;
  persist();
  render();
}

function compactAnalysis(analysis = {}) {
  return {
    title: analysis?.title || "",
    field: analysis?.field || "",
    overallSummary: analysis?.overallSummary || "",
    paragraphs: Array.isArray(analysis?.paragraphs) ? analysis.paragraphs.slice(0, 10).map((p) => ({ index: p.index, role: p.role, summary: p.summary, coreClaim: p.coreClaim })) : [],
    comparisons: Array.isArray(analysis?.comparisons) ? analysis.comparisons.slice(0, 8).map((c) => ({ axis: c.axis, a: c.a, b: c.b, meaning: c.meaning })) : [],
    glossary: Array.isArray(analysis?.glossary) ? analysis.glossary.slice(0, 12).map((g) => ({ term: g.term, inTextMeaning: g.inTextMeaning })) : [],
    trickySentences: Array.isArray(analysis?.trickySentences) ? analysis.trickySentences.slice(0, 6).map((t) => ({ sentence: t.sentence, testPoint: t.testPoint })) : []
  };
}

const EXAM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "markers", "annotatedPassage"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "sourceIntent", "question", "viewBox", "table", "choices", "answer", "correctReason", "wrongReasons", "markerIds"],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          sourceIntent: { type: "string" },
          question: { type: "string" },
          viewBox: { type: "string" },
          table: {
            type: "object",
            additionalProperties: false,
            required: ["caption", "headers", "rows"],
            properties: {
              caption: { type: "string" },
              headers: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "array", items: { type: "string" } } }
            }
          },
          choices: { type: "array", items: { type: "object", additionalProperties: false, required: ["number", "text"], properties: { number: { type: "number" }, text: { type: "string" } } } },
          answer: { type: "number" },
          correctReason: { type: "string" },
          wrongReasons: { type: "array", items: { type: "string" } },
          markerIds: { type: "array", items: { type: "string" } }
        }
      }
    },
    markers: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "style", "text"], properties: { id: { type: "string" }, label: { type: "string" }, style: { type: "string", enum: ["underline", "box", "circle"] }, text: { type: "string" } } } },
    annotatedPassage: { type: "string" }
  }
};

function buildExamPrompt(entry) {
  const passage = getRecordPassage(entry);
  const count = clamp(entry.questionCount, 1, MAX_ITEMS_PER_PASSAGE);
  const analysis = compactAnalysis(entry.analysis || {});
  return `[시험지 제작 전용 요청]
다음 지문으로 실제 수능형 국어 객관식 문항 세트를 제작한다. 기존 객관식 출제 원칙을 그대로 따르되, 아래 전용 규칙을 우선한다.

[절대 조건]
- 생성 문항 수: 정확히 ${count}개. 1문항당 5지선다.
- 모든 문항 난이도는 최상. 짧은 세트일수록 각 문항에 문단 결합, 조건·예외, 인과 방향, 보기 적용, 문장 의미 추론을 더 깊게 활용한다.
- 원문을 읽지 않은 사람은 배경지식만으로 풀 수 없어야 한다.
- 선지는 모두 그럴듯하게 작성하며, 단언어·노골적인 일반화·정답만 원문 복붙 같은 쉬운 단서를 금지한다.
- 문항은 먼저 설계한다. 그 후 실제 시험지에 실을 지문을 작성한다.
- 지문은 반드시 문항보다 먼저 시험지에 배치된다. 그러므로 문항에서 밑줄/ⓐⓑⓒ/ㄱㄴㄷ/사각 박스가 필요하면, annotatedPassage에 해당 원문 구절을 [[MARKER_ID|원문 구절]] 형태로 정확히 감싸라.
- MARKER_ID는 markers의 id와 같아야 하며, tag 안의 원문 구절은 바꾸거나 줄이지 않는다. marker가 필요 없으면 markers는 []이고 annotatedPassage는 원문 그대로 둔다.
- marker label은 ⓐ, ⓑ, ⓒ, ㉠, ㉡, ㄱ, ㄴ 중 맥락에 맞는 것을 쓴다. style은 underline, box, circle 중 하나다. 1~4개만 사용한다.
- <보기>가 필요할 때만 viewBox에 완결된 보기 전문을 쓴다. 필요 없으면 빈 문자열이다.
- 표가 필요할 때만 table에 caption/headers/rows를 넣는다. 필요 없으면 caption은 빈 문자열, headers와 rows는 빈 배열이다.
- 해설에는 정답이 정답인 이유와 각 오답이 오답인 이유가 필요하므로 correctReason 1개와 wrongReasons 5개를 모두 작성한다. wrongReasons의 정답 자리에는 "정답 선지"라고 적는다.
- output은 JSON만. items를 먼저 완성하고 markers, annotatedPassage를 마지막에 작성한다.

[원문 지문]
${passage}

[분석 결과 요약]
${JSON.stringify(analysis, null, 2)}

[출력 구조]
- items: ${count}개 문항. 각 문항은 id/type/sourceIntent/question/viewBox/table/choices(1~5)/answer/correctReason/wrongReasons(1~5)/markerIds를 가진다.
- markers: 실제 지문에 표시할 기호 목록.
- annotatedPassage: 원문 전체를 유지하되 marker가 필요한 정확한 원문 부분만 [[id|text]]로 감싼 완성 지문.`;
}

function stripFence(text) {
  return String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseJsonSafely(text) {
  const source = stripFence(text);
  const candidates = [source];
  const start = source.indexOf("{");
  if (start >= 0) {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inString = false; }
      else if (ch === '"') inString = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}" && --depth === 0) { candidates.push(source.slice(start, i + 1)); break; }
    }
  }
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* next */ }
  }
  throw new Error("모델 응답을 시험지 JSON으로 해석하지 못했습니다.");
}

function extractEventDelta(event = {}) {
  return typeof event.delta === "string" ? event.delta : (typeof event.text === "string" ? event.text : "");
}

async function generateExamSet(entry) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API 키가 없습니다. 메인 화면의 설정에서 API 키를 먼저 적용하세요.");
  const { model, reasoningMode, reasoningEffort } = getModelSettings();
  const body = {
    model,
    instructions: `${QUESTION_INSTRUCTIONS}\n\n[시험지 제작 모드 추가 지시]\n너는 여러 지문을 하나의 시험지로 묶는 전문 출제자다. 반드시 최고 난이도의 5지선다만 만든다. 원문에 근거하지 않는 사실은 절대 쓰지 않는다.`,
    input: buildExamPrompt(entry),
    store: false,
    stream: true,
    max_output_tokens: Math.min(16000, 3400 + clamp(entry.questionCount, 1, MAX_ITEMS_PER_PASSAGE) * 1500),
    text: { format: { type: "json_schema", name: "korean_exam_builder_set", strict: true, schema: EXAM_SCHEMA } }
  };
  if (reasoningMode) body.reasoning = { effort: reasoningEffort };
  else body.temperature = 0.35;

  terminalLine(`REQUEST ${entry.title} · ${entry.questionCount}문항 · model=${model}`, "info");
  const response = await fetch(ENDPOINT, { method: "POST", mode: "cors", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = raw;
    try { message = JSON.parse(raw)?.error?.message || raw; } catch { /* noop */ }
    throw new Error(`${response.status}: ${message}`);
  }
  if (!response.body) throw new Error("브라우저가 스트리밍 응답 본문을 제공하지 않았습니다.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let completed = null;
  const handle = (block) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.replace(/^data:\s?/, "")).join("\n").trim();
    if (!data || data === "[DONE]") return;
    let event;
    try { event = JSON.parse(data); } catch { return; }
    const delta = extractEventDelta(event);
    if (delta) {
      output += delta;
      const preview = delta.replace(/\s+/g, " ").trim();
      if (preview) terminalLine(preview.slice(0, 260), "delta");
    }
    if (event.type === "response.completed" && event.response) completed = event.response;
    if (event.type === "response.failed") throw new Error(event.response?.error?.message || event.error?.message || "Responses 스트리밍이 실패했습니다.");
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    blocks.forEach(handle);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer);
  if (!output && typeof completed?.output_text === "string") output = completed.output_text;
  if (!output) throw new Error("스트리밍이 끝났지만 문항 JSON 본문이 비어 있습니다.");
  const parsed = parseJsonSafely(output);
  return normalizeExamSet(parsed, entry);
}

function normalizeExamSet(raw = {}, entry) {
  const count = clamp(entry.questionCount, 1, MAX_ITEMS_PER_PASSAGE);
  const markers = Array.isArray(raw.markers) ? raw.markers.slice(0, 4).map((marker, index) => ({
    id: String(marker?.id || `M${index + 1}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || `M${index + 1}`,
    label: String(marker?.label || ["ⓐ", "ⓑ", "ⓒ", "㉠"][index] || "ⓐ"),
    style: ["underline", "box", "circle"].includes(marker?.style) ? marker.style : "underline",
    text: String(marker?.text || "").trim()
  })).filter((marker) => marker.text);
  const sourceItems = Array.isArray(raw.items) ? raw.items.slice(0, count) : [];
  const items = sourceItems.map((item, index) => {
    const choices = Array.isArray(item?.choices) ? item.choices.slice(0, 5).map((choice, ci) => ({ number: Number(choice?.number || ci + 1), text: String(choice?.text || "") })).filter((choice) => choice.text) : [];
    while (choices.length < 5) choices.push({ number: choices.length + 1, text: `선지 ${choices.length + 1}` });
    const answer = clamp(Number(item?.answer || 1), 1, 5);
    const wrongReasons = Array.isArray(item?.wrongReasons) ? item.wrongReasons.slice(0, 5).map(String) : [];
    while (wrongReasons.length < 5) wrongReasons.push("");
    wrongReasons[answer - 1] = wrongReasons[answer - 1] || "정답 선지";
    return {
      id: String(item?.id || `q${index + 1}`),
      type: String(item?.type || "고난도 5지선다"),
      sourceIntent: String(item?.sourceIntent || "지문 핵심 논리와 조건을 종합적으로 판단한다."),
      question: String(item?.question || "윗글의 내용으로 가장 적절한 것은?"),
      viewBox: String(item?.viewBox || ""),
      table: {
        caption: String(item?.table?.caption || ""),
        headers: Array.isArray(item?.table?.headers) ? item.table.headers.map(String).slice(0, 6) : [],
        rows: Array.isArray(item?.table?.rows) ? item.table.rows.slice(0, 8).map((row) => Array.isArray(row) ? row.map(String).slice(0, 6) : []) : []
      },
      choices,
      answer,
      correctReason: String(item?.correctReason || "정답 선지가 지문의 조건과 관계를 정확히 반영합니다."),
      wrongReasons,
      markerIds: Array.isArray(item?.markerIds) ? item.markerIds.map(String) : [],
      included: item?.included !== false
    };
  });
  if (!items.length) throw new Error("생성된 객관식 문항이 없습니다.");
  const annotatedPassage = String(raw.annotatedPassage || entry.passage || "").trim();
  return { items, markers, annotatedPassage, generatedAt: new Date().toISOString(), model: getModelSettings().model };
}

async function generateEntries(ids = null) {
  if (state.busy) return;
  const targets = ids ? state.entries.filter((entry) => ids.includes(entry.id)) : sortedEntries({ selectedOnly: true });
  if (!targets.length) { toast("먼저 시험지에 넣을 지문을 선택하세요."); return; }
  state.busy = true;
  openTerminal("문항 제작 스트리밍 로그");
  terminalLine(`START selected=${targets.length} · 각 지문은 독립 호출로 제작합니다.`, "info");
  persist();
  for (let index = 0; index < targets.length; index += 1) {
    const entry = targets[index];
    entry.status = "제작 중";
    entry.error = "";
    persist();
    render();
    terminalLine(`\n[${index + 1}/${targets.length}] ${entry.title} 제작 시작`, "info");
    try {
      entry.passage = getRecordPassage(entry);
      entry.set = await generateExamSet(entry);
      entry.status = "완료";
      terminalLine(`[DONE] ${entry.title} · ${entry.set.items.length}문항 저장 완료`, "success");
      persist();
    } catch (error) {
      const message = error?.message || String(error);
      entry.status = "오류";
      entry.error = message;
      terminalLine(`[ERROR] ${entry.title}: ${message}`, "error");
      addDiagnostic("문항 제작 실패", `${entry.title}: ${message}`, diagnoseError(message));
      persist();
      if (isBillingOrQuotaError(message)) {
        terminalLine("[STOP] 결제/쿼터 제한이 감지되었습니다. 완료된 문항 세트는 저장했으며 이후 호출을 중단합니다.", "error");
        break;
      }
    }
  }
  state.busy = false;
  state.terminal.running = false;
  persist();
  if (selectedQuestionSets().length) {
    terminalLine("[READY] 시험지 미리보기를 열 수 있습니다.", "success");
    setTimeout(() => { if (!state.terminal.open) return; state.terminal.open = false; state.view = "paper"; render(); }, 900);
  } else {
    render();
  }
}

function isBillingOrQuotaError(message = "") {
  return /(billing|payment|quota|insufficient_quota|credit|잔액|결제|한도|429)/i.test(String(message));
}

function diagnoseError(message = "") {
  if (isBillingOrQuotaError(message)) return "API 결제 한도 또는 쿼터가 의심됩니다. 현재까지 완료된 지문은 자동 저장되었습니다. OpenAI 사용량/결제 상태를 확인한 뒤, 오류 난 지문만 재시도하세요.";
  if (/401|api key|unauthorized|인증/i.test(message)) return "메인 설정의 API 키 인식 상태를 확인하세요. 키를 다시 적용한 뒤 이 지문만 재시도하면 됩니다.";
  if (/failed to fetch|network|cors|networkerror/i.test(message)) return "학교망, VPN, 광고차단 확장, 브라우저 보안 설정이 API 요청을 차단할 수 있습니다. 127.0.0.1 로컬 서버에서도 재현되는지 확인하세요.";
  if (/json|parse|schema|output/i.test(message)) return "모델 출력이 구조화 JSON으로 끝나지 않았을 수 있습니다. 문항 수를 줄이거나 같은 지문만 재시도하세요.";
  return "세부 로그를 복사하여 GitHub 이슈에 재현 절차와 함께 남기면 원인 추적이 쉬워집니다.";
}

function renderAnnotatedPassage(passage = "", markers = []) {
  const markerMap = new Map(markers.map((marker) => [marker.id, marker]));
  return escapeHtml(passage).replace(/\[\[([A-Za-z0-9_-]+)\|([\s\S]*?)\]\]/g, (_, id, body) => {
    const marker = markerMap.get(id) || { label: "ⓐ", style: "underline" };
    return `<span class="exam-pass-marker ${escapeHtml(marker.style)}"><sup>${escapeHtml(marker.label)}</sup>${body}</span>`;
  }).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");
}

function paperStyle() {
  return `<style>
  @page { size:A4; margin:12mm 10mm 14mm; }
  *{box-sizing:border-box} body{margin:0;color:#111;font-family:"Noto Serif KR","Noto Sans KR",serif;font-size:10pt;line-height:1.56} .head{border-bottom:1.6px solid #111;text-align:center;padding:0 0 7px;margin-bottom:9px;position:relative}.head h1{margin:0;font-size:20pt;letter-spacing:-.08em}.head p{margin:2px 0 0;font-size:8.8pt}.page-no{position:fixed;bottom:5mm;left:50%;transform:translateX(-50%);font:8pt sans-serif}.paper{column-count:2;column-gap:8mm;column-rule:1px solid #111}.group{break-inside:avoid;margin:0 0 12px}.guide{font-weight:800;margin:0 0 6px}.passage{border:1px solid #777;padding:9px 10px;margin:0 0 9px;text-align:justify;word-break:keep-all}.passage p{margin:0 0 7px}.passage p:last-child{margin-bottom:0}.item{break-inside:avoid;margin:0 0 11px}.stem{font-weight:500;word-break:keep-all}.num{font-weight:900;margin-right:5px}.choices{list-style:none;padding:0;margin:5px 0 0}.choices li{display:flex;gap:5px;margin:2px 0;word-break:keep-all}.choice-n{font-weight:700;flex:0 0 auto}.view{border:1px solid #777;padding:8px 9px;margin:6px 0;text-align:justify;white-space:pre-wrap}.view-title{text-align:center;font-weight:800;margin:-2px 0 4px}.data-table{width:100%;border-collapse:collapse;margin:6px 0;font-size:8.6pt}.data-table th,.data-table td{border:1px solid #777;padding:4px;vertical-align:top}.data-table th{background:#f1f1f1}.exam-pass-marker.underline{text-decoration:underline;text-decoration-thickness:1.2px;text-underline-offset:2px}.exam-pass-marker.box{border:1px solid #333;padding:0 2px}.exam-pass-marker.circle{border:1px solid #333;border-radius:2px;padding:0 2px}.exam-pass-marker sup{font-size:7.5pt;font-weight:900;margin-right:2px}.solution-grid{columns:2;column-gap:8mm}.answer-table{width:100%;border-collapse:collapse;margin:8px 0 12px;font-family:sans-serif;font-size:9pt}.answer-table td,.answer-table th{border:1px solid #555;padding:5px;text-align:center}.sol{break-inside:avoid;border-bottom:1px solid #aaa;padding:0 0 9px;margin:0 0 9px}.sol h3{font-size:10pt;margin:0 0 5px}.sol p{margin:4px 0;word-break:keep-all}.wrong{font-size:9pt;color:#333}.no-print{font-family:sans-serif}.no-print button{margin:8px;padding:8px 10px}@media print{.no-print{display:none}}
  </style>`;
}

function getIncludedSequence() {
  let number = 0;
  return selectedQuestionSets().flatMap((entry) => entry.set.items.filter((item) => item.included !== false).map((item) => ({ entry, item, number: ++number })));
}

function buildPaperHtml() {
  const sets = selectedQuestionSets();
  const sequence = getIncludedSequence();
  const byEntry = new Map();
  sequence.forEach((value) => { if (!byEntry.has(value.entry.id)) byEntry.set(value.entry.id, []); byEntry.get(value.entry.id).push(value); });
  const groups = sets.map((entry) => {
    const items = byEntry.get(entry.id) || [];
    if (!items.length) return "";
    return `<section class="group"><p class="guide">[${items[0].number}~${items.at(-1).number}] 다음 글을 읽고 물음에 답하시오.</p><div class="passage"><p>${renderAnnotatedPassage(entry.set.annotatedPassage || entry.passage, entry.set.markers || [])}</p></div>${items.map(({ item, number }) => renderPaperItem(item, number)).join("")}</section>`;
  }).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>반짝국어 시험지</title>${paperStyle()}</head><body><div class="no-print"><button onclick="print()">인쇄 / PDF 저장</button></div><header class="head"><h1>반짝국어 객관식 모의시험</h1><p>국어 독서 · 고난도 문항 · 총 ${sequence.length}문항</p></header><main class="paper">${groups || "<p>포함된 문항이 없습니다.</p>"}</main><div class="page-no">반짝국어 시험지</div></body></html>`;
}

function renderPaperItem(item, number) {
  const view = item.viewBox ? `<div class="view"><div class="view-title">&lt;보 기&gt;</div>${escapeHtml(item.viewBox)}</div>` : "";
  const table = renderPaperTable(item.table);
  return `<article class="item"><div class="stem"><span class="num">${number}.</span>${escapeHtml(item.question)}</div>${view}${table}<ol class="choices">${item.choices.map((choice) => `<li><span class="choice-n">${["①","②","③","④","⑤"][choice.number - 1] || choice.number}</span><span>${escapeHtml(choice.text)}</span></li>`).join("")}</ol></article>`;
}

function renderPaperTable(table = {}) {
  if (!table?.headers?.length || !table?.rows?.length) return "";
  return `<table class="data-table"><caption>${escapeHtml(table.caption || "")}</caption><thead><tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function buildSolutionsHtml() {
  const sequence = getIncludedSequence();
  const answerRows = sequence.map(({ item, number }) => `<tr><th>${number}</th><td>${["①","②","③","④","⑤"][item.answer - 1] || item.answer}</td></tr>`).join("");
  const detail = sequence.map(({ entry, item, number }) => `<article class="sol"><h3>${number}. ${escapeHtml(item.type)} <small>(${escapeHtml(entry.title)})</small></h3><p><b>정답 ${["①","②","③","④","⑤"][item.answer - 1] || item.answer}</b> · ${escapeHtml(item.correctReason)}</p><div class="wrong">${item.choices.map((choice) => `<p>${["①","②","③","④","⑤"][choice.number - 1] || choice.number} ${choice.number === item.answer ? "정답 선지" : escapeHtml(item.wrongReasons[choice.number - 1] || "지문 조건과 정확히 일치하지 않습니다.")}</p>`).join("")}</div></article>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>반짝국어 해설지</title>${paperStyle()}</head><body><div class="no-print"><button onclick="print()">인쇄 / PDF 저장</button></div><header class="head"><h1>반짝국어 객관식 해설지</h1><p>정답표와 선지별 판정 근거</p></header><section><h2 style="font-size:12pt;margin:0 0 5px">정답표</h2><table class="answer-table"><tbody>${answerRows || "<tr><td>문항 없음</td></tr>"}</tbody></table></section><main class="solution-grid">${detail}</main><div class="page-no">반짝국어 해설지</div></body></html>`;
}

function openPrintWindow(kind) {
  const html = kind === "solutions" ? buildSolutionsHtml() : buildPaperHtml();
  const win = window.open("", "_blank");
  if (!win) { addDiagnostic("인쇄 창 열기 실패", "브라우저가 팝업을 차단했습니다.", "주소 표시줄 오른쪽의 팝업 차단 아이콘에서 이 사이트의 팝업을 허용한 뒤 다시 시도하세요."); toast("팝업이 차단되었습니다. 진단 기록을 확인하세요."); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener("load", () => setTimeout(() => win.print(), 220), { once: true });
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportSession() {
  downloadText(`반짝국어_시험지작업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getExamSession(), null, 2), "application/json;charset=utf-8");
  toast("시험지 작업 JSON을 내보냈습니다.");
}

function clearCurrentSession() {
  if (!confirm("현재 시험지 작업을 비울까요? 브라우저 자동 저장본도 함께 지워집니다.")) return;
  state.entries = [];
  state.importedFiles = [];
  state.diagnostics = [];
  clearSession();
  render();
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function downloadItemImage(key) {
  const [entryId, itemId] = key.split("|");
  const entry = state.entries.find((value) => value.id === entryId);
  const item = entry?.set?.items?.find((value) => value.id === itemId);
  if (!entry || !item) return;
  const sequence = getIncludedSequence();
  const no = sequence.find((value) => value.entry.id === entryId && value.item.id === itemId)?.number || 0;
  const width = 1600;
  const padding = 92;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 34px 'Noto Sans KR', Arial";
  const blocks = [
    { text: `${no || ""}. ${item.question}`, font: "bold 38px 'Noto Sans KR', Arial", gap: 22 },
    ...item.choices.map((choice) => ({ text: `${["①","②","③","④","⑤"][choice.number - 1] || choice.number} ${choice.text}`, font: "30px 'Noto Sans KR', Arial", gap: 14 }))
  ];
  let height = 170;
  for (const block of blocks) { ctx.font = block.font; height += wrapCanvasText(ctx, block.text, width - padding * 2).length * 48 + block.gap; }
  canvas.width = width;
  canvas.height = Math.max(720, height + 90);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827"; ctx.font = "bold 28px 'Noto Sans KR', Arial"; ctx.fillText(`${entry.title} · ${item.type}`, padding, 72);
  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padding, 92); ctx.lineTo(width - padding, 92); ctx.stroke();
  let y = 145;
  for (const block of blocks) {
    ctx.font = block.font; ctx.fillStyle = "#111827";
    for (const line of wrapCanvasText(ctx, block.text, width - padding * 2)) { ctx.fillText(line, padding, y); y += 48; }
    y += block.gap;
  }
  const anchor = document.createElement("a");
  anchor.download = `반짝국어_${String(no || item.id).padStart(2, "0")}_${entry.title.replace(/[\\/:*?"<>|]/g, "_")}.png`;
  anchor.href = canvas.toDataURL("image/png");
  anchor.click();
}

async function copyText(text, successMessage) {
  try { await navigator.clipboard.writeText(text); toast(successMessage); }
  catch { downloadText("반짝국어_제작로그.txt", text); toast("클립보드 접근이 막혀 텍스트 파일로 저장했습니다."); }
}

function showDiagnostics() {
  const body = state.diagnostics.length ? state.diagnostics.map((diag) => `<article class="exam-diag"><b>${escapeHtml(diag.title)}</b><p>${escapeHtml(diag.message)}</p><small>${escapeHtml(diag.guide)} · ${escapeHtml(new Date(diag.at).toLocaleString())}</small></article>`).join("") : `<div class="exam-empty">아직 진단 기록이 없습니다.</div>`;
  state.detailEntryId = null;
  const modal = document.createElement("div");
  modal.className = "exam-modal-backdrop";
  modal.innerHTML = `<section class="exam-modal"><div class="exam-modal-head"><h2>시험지 제작 진단 기록</h2><button class="exam-btn small">닫기</button></div><div class="exam-diagnostics">${body}</div></section>`;
  modal.querySelector("button").addEventListener("click", () => modal.remove());
  document.body.append(modal);
}

function openGithubIssue() {
  const log = state.terminal.lines.map((line) => `[${line.stamp}] ${line.text}`).join("\n");
  const diag = state.diagnostics.map((item) => `- ${item.title}: ${item.message}\n  ${item.guide}`).join("\n");
  const body = `## 반짝국어 시험지 제작 오류\n\n- 시각: ${new Date().toLocaleString()}\n- 브라우저 온라인: ${navigator.onLine}\n- 선택 지문 수: ${sortedEntries({ selectedOnly: true }).length}\n\n### 진단\n${diag || "없음"}\n\n### 제작 로그\n\`\`\`\n${log || "로그 없음"}\n\`\`\``;
  const url = `${GITHUB_ISSUES}?title=${encodeURIComponent("[시험지 제작] 오류 리포트")}&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

injectStyles();
restore();
attachLauncher();
