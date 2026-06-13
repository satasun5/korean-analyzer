import { ANALYSIS_SCHEMA, QUESTION_SCHEMA } from "./schema.js";
import {
  ANALYSIS_INSTRUCTIONS,
  QUESTION_INSTRUCTIONS,
  EXPLAIN_SELECTION_INSTRUCTIONS,
  buildAnalysisPrompt,
  buildQuestionPrompt,
  buildSelectionPrompt,
  SHORT_ANSWER_GRADING_INSTRUCTIONS,
  QUESTION_ASSIST_INSTRUCTIONS,
  buildShortAnswerGradingPrompt,
  buildQuestionAssistPrompt,
  CLEANUP_INSTRUCTIONS,
  buildCleanupPrompt,
  BATCH_SHORT_GRADING_INSTRUCTIONS,
  buildBatchShortGradingPrompt
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

async function callResponses({ apiKey, model, instructions, prompt, schema, schemaName, reasoningMode, reasoningEffort }) {
  if (!apiKey) throw new Error("API 키가 없습니다. 데모 모드를 사용하거나 키를 입력해 주세요.");

  const body = {
    model,
    instructions,
    input: prompt,
    store: false,
    max_output_tokens: 12000,
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

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const text = extractOutputText(data);
  if (!text) throw new Error("모델 응답에서 텍스트를 찾지 못했습니다.");
  return parseJson(text);
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

export async function generateQuestions({ apiKey, model, reasoningMode, reasoningEffort, passage, analysis }) {
  return callResponses({
    apiKey,
    model,
    reasoningMode,
    reasoningEffort,
    instructions: QUESTION_INSTRUCTIONS,
    prompt: buildQuestionPrompt(passage, analysis),
    schema: QUESTION_SCHEMA,
    schemaName: "korean_question_set"
  });
}

export async function explainSelection({ apiKey, model, reasoningMode, reasoningEffort, passage, selectedText, memoContext }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["simple", "context", "testPoint", "example"],
    properties: {
      simple: { type: "string" },
      context: { type: "string" },
      testPoint: { type: "string" },
      example: { type: "string" }
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
