import { ANALYSIS_SCHEMA, QUESTION_SCHEMA } from "./schema.js";
import {
  ANALYSIS_INSTRUCTIONS,
  QUESTION_INSTRUCTIONS,
  EXPLAIN_SELECTION_INSTRUCTIONS,
  buildAnalysisPrompt,
  buildQuestionPrompt,
  buildMultipleChoicePrompt,
  buildOxShortPrompt,
  buildSelectionPrompt,
  SHORT_ANSWER_GRADING_INSTRUCTIONS,
  QUESTION_ASSIST_INSTRUCTIONS,
  buildShortAnswerGradingPrompt,
  buildQuestionAssistPrompt,
  CLEANUP_INSTRUCTIONS,
  buildCleanupPrompt,
  BATCH_SHORT_GRADING_INSTRUCTIONS,
  buildBatchShortGradingPrompt,
  MEMO_ASSIST_INSTRUCTIONS,
  buildMemoAssistPrompt,
  CHAT_BOTS_INSTRUCTIONS,
  buildChatBotsPrompt
} from "./prompts.js";

const ENDPOINT = "https://api.openai.com/v1/responses";

function extractOutputText(data) {
  // Responses API는 대부분 output_text를 제공합니다. output 배열을 순회할 때
  // 같은 content.text를 두 번 push하면 JSON이 { ... }{ ... }처럼 중복되어 파싱 실패가 납니다.
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const chunks = [];
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const content of item.content) {
          if (typeof content.text === "string") chunks.push(content.text);
        }
      }
    }
  }
  return chunks.join("\n");
}

function stripJsonFence(text) {
  return text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJson(text) {
  const cleaned = stripJsonFence(text);
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const start = cleaned.indexOf("{");
    if (start < 0) throw firstError;
    // 모델/브라우저 파싱 문제로 JSON 뒤에 중복 문자열이 붙은 경우 첫 번째 완결 객체만 추출합니다.
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
      } else {
        if (ch === '"') inString = true;
        else if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
        }
      }
    }
    const end = cleaned.lastIndexOf("}");
    if (end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw firstError;
  }
}

function getJsonErrorPosition(message = "") {
  const match = String(message || "").match(/position\s+(\d+)/i);
  return match ? Number(match[1]) : -1;
}

function makeParseDebug({ text, error, schemaName, model, data }) {
  const position = getJsonErrorPosition(error?.message || "");
  const around = position >= 0
    ? text.slice(Math.max(0, position - 700), Math.min(text.length, position + 700))
    : "position 정보를 찾지 못했습니다.";
  const tail = text.slice(Math.max(0, text.length - 1400));
  return [
    `schemaName: ${schemaName || "unknown"}`,
    `model: ${model || "unknown"}`,
    `responseStatus: ${data?.status || "unknown"}`,
    `incompleteReason: ${data?.incomplete_details?.reason || "none"}`,
    `outputLength: ${text.length}`,
    `errorPosition: ${position}`,
    `usage: ${JSON.stringify(data?.usage || {})}`,
    "",
    "[오류 위치 주변]",
    around,
    "",
    "[응답 마지막 부분]",
    tail
  ].join("\n");
}

function getRuntimeInfo() {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const loc = typeof location !== "undefined" ? location : null;
  return {
    origin: loc?.origin || "unknown",
    protocol: loc?.protocol || "unknown",
    online: nav?.onLine ?? "unknown",
    userAgent: nav?.userAgent || "unknown"
  };
}

function makeNetworkDebug({ error, schemaName, model, payloadLength, attempt }) {
  const runtime = getRuntimeInfo();
  return [
    `schemaName: ${schemaName || "unknown"}`,
    `model: ${model || "unknown"}`,
    `endpoint: ${ENDPOINT}`,
    `origin: ${runtime.origin}`,
    `protocol: ${runtime.protocol}`,
    `browserOnline: ${runtime.online}`,
    `payloadLength: ${payloadLength}`,
    `attempt: ${attempt}`,
    `errorName: ${error?.name || "unknown"}`,
    `errorMessage: ${error?.message || String(error)}`,
    "",
    "[확인할 것]",
    "1. 브라우저 개발자도구 Console/Network에서 responses 요청이 CORS, blocked, ERR_NETWORK, ERR_CONNECTION_RESET 중 무엇인지 확인",
    "2. 광고차단/보안앱/학교망/VPN이 api.openai.com 요청을 막는지 확인",
    "3. 같은 키와 같은 지문으로 127.0.0.1 로컬 서버에서 되는지 확인",
    "4. 요청 본문이 지나치게 크면 지문을 조금 줄여 재시도"
  ].join("\n");
}

async function fetchWithRetry(url, options, retries = 1) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt > retries) {
        error.attempt = attempt;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw lastError;
}

async function callResponses({ apiKey, model, instructions, prompt, schema, schemaName, reasoningMode, reasoningEffort, maxOutputTokens = 12000 }) {
  if (!apiKey) throw new Error("API 키가 없습니다. 데모 모드를 사용하거나 키를 입력해 주세요.");

  const body = {
    model,
    instructions,
    input: prompt,
    store: false,
    max_output_tokens: maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    }
  };

  if (reasoningMode) {
    body.reasoning = { effort: reasoningEffort || "medium" };
  } else {
    body.temperature = 0.35;
  }

  const requestPayload = JSON.stringify(body);
  let response;
  try {
    response = await fetchWithRetry(ENDPOINT, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: requestPayload
    }, 1);
  } catch (error) {
    const details = makeNetworkDebug({
      error,
      schemaName,
      model,
      payloadLength: requestPayload.length,
      attempt: error?.attempt || 1
    });
    throw new Error(`네트워크 요청 실패: ${error?.message || error}\n\n${details}`);
  }

  const raw = await response.text().catch(() => "");
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.raw?.slice?.(0, 500) || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const text = extractOutputText(data);
  if (!text) {
    const preview = raw ? raw.slice(0, 500) : "empty response";
    throw new Error(`모델 응답에서 텍스트를 찾지 못했습니다. 응답 미리보기: ${preview}`);
  }
  if (data?.status === "incomplete") {
    const details = makeParseDebug({ text, error: new Error("incomplete"), schemaName, model, data });
    throw new Error(`모델 출력이 중간에 잘렸습니다. schema=${schemaName}, reason=${data?.incomplete_details?.reason || "unknown"}.\n\n${details}`);
  }
  try {
    return parseJson(text);
  } catch (error) {
    const preview = text.slice(0, 800);
    const details = makeParseDebug({ text, error, schemaName, model, data });
    throw new Error(`모델 JSON 파싱 실패: ${error.message}. 응답 미리보기: ${preview}\n\n${details}`);
  }
}

export async function analyzePassage({ apiKey, model, reasoningMode, reasoningEffort, passage }) {
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: ANALYSIS_INSTRUCTIONS,
    prompt: buildAnalysisPrompt(passage),
    schema: ANALYSIS_SCHEMA,
    schemaName: "korean_passage_analysis"
  });
}


export async function cleanupPassageWithAi({ apiKey, model, passage }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["cleanedPassage"],
    properties: { cleanedPassage: { type: "string" } }
  };
  return callResponses({
    apiKey,
    model,
    reasoningMode: false,
    instructions: CLEANUP_INSTRUCTIONS,
    prompt: buildCleanupPrompt(passage),
    schema,
    schemaName: "ocr_cleanup"
  });
}

const MULTIPLE_CHOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["multipleChoice", "weaknessGuide"],
  properties: {
    multipleChoice: QUESTION_SCHEMA.properties.multipleChoice,
    weaknessGuide: QUESTION_SCHEMA.properties.weaknessGuide
  }
};

const OX_SHORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ox", "shortAnswer", "weaknessGuide"],
  properties: {
    ox: QUESTION_SCHEMA.properties.ox,
    shortAnswer: QUESTION_SCHEMA.properties.shortAnswer,
    weaknessGuide: QUESTION_SCHEMA.properties.weaknessGuide
  }
};

export async function generateQuestions({ apiKey, model, reasoningMode, reasoningEffort, passage, analysis, options }) {
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: QUESTION_INSTRUCTIONS,
    prompt: buildQuestionPrompt(passage, analysis, options),
    schema: QUESTION_SCHEMA,
    schemaName: "korean_question_set",
    maxOutputTokens: 18000
  });
}

export async function generateMultipleChoiceQuestions({ apiKey, model, reasoningMode, reasoningEffort, passage, analysis, options }) {
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: QUESTION_INSTRUCTIONS,
    prompt: buildMultipleChoicePrompt(passage, analysis, options),
    schema: MULTIPLE_CHOICE_SCHEMA,
    schemaName: "korean_multiple_choice_set",
    maxOutputTokens: 16000
  });
}

export async function generateOxShortQuestions({ apiKey, model, reasoningMode, reasoningEffort, passage, analysis, options }) {
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: QUESTION_INSTRUCTIONS,
    prompt: buildOxShortPrompt(passage, analysis, options),
    schema: OX_SHORT_SCHEMA,
    schemaName: "korean_ox_short_question_set",
    maxOutputTokens: 15000
  });
}

export async function explainSelection({ apiKey, model, reasoningMode, reasoningEffort, passage, selectedText, memoContext }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["simple"],
    properties: {
      simple: { type: "string" }
    }
  };
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: EXPLAIN_SELECTION_INSTRUCTIONS,
    prompt: buildSelectionPrompt({ selectedText, passage, memoContext }),
    schema,
    schemaName: "selection_explanation"
  });
}


export async function gradeShortAnswer({ apiKey, model, reasoningMode, reasoningEffort, passage, question, idealAnswer, gradingPoints, userAnswer }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["score", "maxScore", "isAcceptable", "verdict", "strength", "weakness", "improvedAnswer"],
    properties: {
      score: { type: "number" },
      maxScore: { type: "number" },
      isAcceptable: { type: "boolean" },
      verdict: { type: "string" },
      strength: { type: "string" },
      weakness: { type: "string" },
      improvedAnswer: { type: "string" }
    }
  };
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: SHORT_ANSWER_GRADING_INSTRUCTIONS,
    prompt: buildShortAnswerGradingPrompt({ passage, question, idealAnswer, gradingPoints, userAnswer }),
    schema,
    schemaName: "short_answer_grading"
  });
}


export async function gradeShortAnswersBatch({ apiKey, model, passage, items }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "score", "maxScore", "isAcceptable", "verdict", "strength", "weakness", "improvedAnswer"],
          properties: {
            id: { type: "string" },
            score: { type: "number" },
            maxScore: { type: "number" },
            isAcceptable: { type: "boolean" },
            verdict: { type: "string" },
            strength: { type: "string" },
            weakness: { type: "string" },
            improvedAnswer: { type: "string" }
          }
        }
      }
    }
  };
  return callResponses({
    apiKey,
    model,
    reasoningMode: false,
    instructions: BATCH_SHORT_GRADING_INSTRUCTIONS,
    prompt: buildBatchShortGradingPrompt({ passage, items }),
    schema,
    schemaName: "batch_short_grading"
  });
}

export async function askAboutMemo({ apiKey, model, reasoningMode, reasoningEffort, passage, selectedText, userQuestion, memoThread }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["answer", "sourcePointer", "suggestedQuestions"],
    properties: {
      answer: { type: "string" },
      sourcePointer: { type: "string" },
      suggestedQuestions: { type: "array", items: { type: "string" } }
    }
  };
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: MEMO_ASSIST_INSTRUCTIONS,
    prompt: buildMemoAssistPrompt({ passage, selectedText, userQuestion, memoThread }),
    schema,
    schemaName: "memo_assist"
  });
}

export async function askChatBots({ apiKey, model, passage, analysis, userQuestion, parentComment, replyMode }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["comments"],
    properties: {
      comments: {
        type: "array",
        minItems: 1,
        maxItems: replyMode ? 2 : 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["author", "persona", "text", "sourcePointer", "timeLabel", "sideReplies"],
          properties: {
            author: { type: "string" },
            persona: { type: "string" },
            text: { type: "string" },
            sourcePointer: { type: "string" },
            timeLabel: { type: "string" },
            sideReplies: {
              type: "array",
              maxItems: 2,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["author", "text"],
                properties: {
                  author: { type: "string" },
                  text: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  };
  return callResponses({
    apiKey,
    model,
    reasoningMode: false,
    instructions: CHAT_BOTS_INSTRUCTIONS,
    prompt: buildChatBotsPrompt({ passage, analysis, userQuestion, parentComment, replyMode }),
    schema,
    schemaName: "cute_grounded_comment_bots"
  });
}


export async function askAboutQuestion({ apiKey, model, reasoningMode, reasoningEffort, passage, questionData, userQuestion, selectedAnswer, solved }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["answer", "hintLevel", "sourcePointer"],
    properties: {
      answer: { type: "string" },
      hintLevel: { type: "string" },
      sourcePointer: { type: "string" }
    }
  };
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: QUESTION_ASSIST_INSTRUCTIONS,
    prompt: buildQuestionAssistPrompt({ passage, questionData, userQuestion, selectedAnswer, solved }),
    schema,
    schemaName: "question_assist"
  });
}
