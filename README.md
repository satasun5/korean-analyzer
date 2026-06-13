# 반짝국어 — AI 지문 분석 작업실

국어 비문학/문학 지문을 입력하면 OpenAI API를 이용해 **요약, 구조화, 문단별 분석, 형광펜, 개념 정리, 비교·대조, 인터랙티브 마인드맵, 5지선다·OX·서술형 문제 생성, AI 질문/채점**을 수행하는 정적 웹앱입니다.

## 주요 기능

### 분석
- OCR 지문 입력 및 문단 단위 분석
- `OCR 정리`: 문단 내부의 강제 줄바꿈을 이어 붙임
- `AI 정돈`: 띄어쓰기·붙어쓰기·문단 흐름을 AI로 정돈
- 전체 요약 및 읽는 법 제공
- 5개 기준 기반 난이도 평가
- 문단별 요약과 구조 타임라인
- 비교·대조 항목 정리
- 개념 탭: 개념 설명, 지문 속 의미, 출처 문단 표시
- 헷갈리는 문장: 쉽게 풀어 설명

### 형광펜
- 핵심 주장, 근거, 비교·대조, 개념 정의, 예시, 주의·반론, 부연·균형 색상 구분
- 같은 구절에 여러 의미가 겹칠 수 있음
- 호버 시 “이 구절이 무엇과 연결되는지 / 무엇의 근거인지 / 무엇과 대조되는지” 설명
- 클릭 시 상세 설명 카드 표시

### 마인드맵
- 중심 노드에서 가지가 뻗는 수형도형 마인드맵
- 노드 드래그
- 빈 공간/휠클릭 드래그로 화면 이동
- 마우스 휠 및 `＋/−` 버튼 확대·축소
- 모바일 터치 이동 지원

### 문제
- 문제 생성은 분석 이후 별도 실행
- 5지선다, OX, 서술형 생성
- 5지선다는 사용자가 먼저 선택한 뒤 채점 및 정오 확인
- OX는 개별 채점과 전체 채점 지원
- 서술형은 개별 AI 채점과 전체 AI 채점 지원
- 문항마다 AI에게 질문하기 지원
- 서술형 채점은 메뉴에서 별도 저비용 모델 설정 가능

### 저장과 작업 흐름
- 분석 결과 저장/불러오기
- 샘플 보기 후 `내 지문`으로 돌아와도 분석·문제·메모 상태 유지
- `새 분석 노트` 버튼으로 새 작업 시작
- 오류 토스트는 자동으로 사라지지 않아 로그 확인 가능
- 일반 안내 토스트는 3초 뒤 자동 사라짐

## 실행 방법

압축을 푼 폴더에서 아래 명령을 실행합니다.

```bash
py -m http.server 8123
```

macOS/Linux에서는 다음 명령을 사용할 수 있습니다.

```bash
python3 -m http.server 8123
```

브라우저에서 접속합니다.

```text
http://127.0.0.1:8123
```

기존 버전을 열었던 적이 있다면 `Ctrl + F5`로 강력 새로고침하세요.

## GitHub Pages 배포

이 저장소에는 `.github/workflows/pages.yml`이 포함되어 있습니다. `main` 브랜치에 push되면 GitHub Actions가 정적 파일을 업로드하고 GitHub Pages로 배포합니다.

배포 주소는 일반적으로 다음 형식입니다.

```text
https://satasun5.github.io/korean-analyzer/
```

저장소 설정에서 Pages source가 GitHub Actions로 되어 있어야 합니다. 만약 첫 배포가 보이지 않으면 GitHub 저장소의 **Settings → Pages → Build and deployment → Source**를 `GitHub Actions`로 확인하세요.

## OpenAI API 키 보안 안내

이 앱은 GitHub Pages에서 돌아가는 정적 웹앱이므로, API 키가 브라우저에서 직접 OpenAI API 요청에 사용됩니다. 앱이 API 키를 서버에 저장하지는 않지만, 공개 서비스로 운영하려면 서버 프록시를 붙이는 방식이 더 안전합니다.

## 파일 구조

```text
index.html
src/
  app.js        # UI 상태, 렌더링, 이벤트
  ai.js         # OpenAI Responses API 호출
  prompts.js    # 분석/문제/채점 프롬프트
  schema.js     # Structured JSON 스키마
  sample.js     # 데모 데이터
  storage.js    # localStorage 저장
  styles.css    # 레이아웃/애니메이션/테마
experimental/
  streaming-analysis.js
  README-streaming.md
tests/
  validate.mjs
.github/workflows/pages.yml
```

## 테스트

```bash
node --check src/*.js
node --check experimental/*.js
node tests/validate.mjs
```

## 현재 버전

v2.2
