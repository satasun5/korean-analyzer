import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'index.html',
  'src/app.js',
  'src/ai.js',
  'src/prompts.js',
  'src/schema.js',
  'src/sample.js',
  'src/storage.js',
  'src/styles.css'
];

for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`missing ${file}`);
  if (fs.statSync(full).size < 100) throw new Error(`too small ${file}`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('src/app.js')) throw new Error('index.html does not load app.js');
if (!html.includes('src/styles.css')) throw new Error('index.html does not load styles.css');

const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
for (const token of ['시작하기', '분석하기', '문제 제작', '전문 추론 모델 사용']) {
  if (!app.includes(token)) throw new Error(`app missing token: ${token}`);
}

const prompts = fs.readFileSync(path.join(root, 'src/prompts.js'), 'utf8');
for (const token of ['선지를 먼저 쓰지 말고', 'OX 퀴즈', '서술형 퀴즈', '보기 적용형']) {
  if (!prompts.includes(token)) throw new Error(`prompt missing token: ${token}`);
}


// Module parse/runtime smoke test with a tiny fake DOM so syntax errors surface before packaging.
const noop = () => {};
const fakeEl = {
  innerHTML: '', value: '', dataset: {}, style: {},
  classList: { add: noop, remove: noop, toggle: noop },
  addEventListener: noop, querySelectorAll: () => [], querySelector: () => null, setAttribute: noop, animate: noop, scrollIntoView: noop
};
globalThis.document = {
  querySelector: (sel) => sel === '#app' ? fakeEl : null,
  querySelectorAll: () => [],
  documentElement: { dataset: {} },
  addEventListener: noop,
  createElement: () => fakeEl
};
globalThis.window = { addEventListener: noop, getSelection: () => ({ toString: () => '' }), scrollY: 0, scrollTo: noop, setTimeout, clearTimeout, setInterval, clearInterval };
globalThis.CSS = { escape: (x) => String(x) };
globalThis.sessionStorage = { getItem: () => '', setItem: noop, removeItem: noop };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); };
await import(`../src/app.js?validate=${Date.now()}`);

console.log('static validation passed and app module import passed');
