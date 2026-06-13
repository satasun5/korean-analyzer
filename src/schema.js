export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "cleanedPassage",
    "title",
    "field",
    "difficulty",
    "overallSummary",
    "readingGuide",
    "paragraphs",
    "flow",
    "structureTimeline",
    "highlights",
    "comparisons",
    "glossary",
    "trickySentences",
    "mindmap",
    "studyTips"
  ],
  properties: {
    cleanedPassage: { type: "string" },
    title: { type: "string" },
    field: { type: "string" },
    difficulty: {
      type: "object",
      additionalProperties: false,
      required: ["level", "score", "reason", "criteria", "trapPoints"],
      properties: {
        level: { type: "string" },
        score: { type: "number" },
        reason: { type: "string" },
        criteria: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "score", "reason"],
            properties: {
              name: { type: "string" },
              score: { type: "number" },
              reason: { type: "string" }
            }
          }
        },
        trapPoints: { type: "array", items: { type: "string" } }
      }
    },
    overallSummary: { type: "string" },
    readingGuide: { type: "string" },
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "index", "role", "summary", "coreClaim", "keywords", "connections"],
        properties: {
          id: { type: "string" },
          index: { type: "number" },
          role: { type: "string" },
          summary: { type: "string" },
          coreClaim: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          connections: { type: "array", items: { type: "string" } }
        }
      }
    },
    flow: { type: "array", items: { type: "string" } },
    structureTimeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "paragraphIds", "description"],
        properties: {
          label: { type: "string" },
          paragraphIds: { type: "array", items: { type: "string" } },
          description: { type: "string" }
        }
      }
    },
    highlights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "paragraphId", "text", "type", "color", "shortReason", "detail"],
        properties: {
          id: { type: "string" },
          paragraphId: { type: "string" },
          text: { type: "string" },
          type: { type: "string" },
          color: { type: "string", enum: ["claim", "evidence", "contrast", "definition", "example", "warning", "support"] },
          shortReason: { type: "string" },
          detail: { type: "string" }
        }
      }
    },
    comparisons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "axis", "a", "b", "meaning", "paragraphIds", "sourceDetail"],
        properties: {
          id: { type: "string" },
          axis: { type: "string" },
          a: { type: "string" },
          b: { type: "string" },
          meaning: { type: "string" },
          paragraphIds: { type: "array", items: { type: "string" } },
          sourceDetail: { type: "string" }
        }
      }
    },
    glossary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "meaning", "inTextMeaning", "sourceText", "paragraphIds", "easyExample"],
        properties: {
          term: { type: "string" },
          meaning: { type: "string" },
          inTextMeaning: { type: "string" },
          sourceText: { type: "string" },
          paragraphIds: { type: "array", items: { type: "string" } },
          easyExample: { type: "string" }
        }
      }
    },
    trickySentences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sentence", "paragraphId", "whyHard", "easyRewrite", "testPoint"],
        properties: {
          sentence: { type: "string" },
          paragraphId: { type: "string" },
          whyHard: { type: "string" },
          easyRewrite: { type: "string" },
          testPoint: { type: "string" }
        }
      }
    },
    mindmap: {
      type: "object",
      additionalProperties: false,
      required: ["nodes", "edges"],
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "kind", "summary"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              kind: { type: "string" },
              summary: { type: "string" }
            }
          }
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["source", "target", "label"],
            properties: {
              source: { type: "string" },
              target: { type: "string" },
              label: { type: "string" }
            }
          }
        }
      }
    },
    studyTips: { type: "array", items: { type: "string" } }
  }
};

export const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["multipleChoice", "ox", "shortAnswer", "weaknessGuide"],
  properties: {
    multipleChoice: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "difficulty",
          "sourceIntent",
          "question",
          "passageExtract",
          "viewBox",
          "choiceDesignFirst",
          "choices",
          "answer",
          "finalExplanation"
        ],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          difficulty: { type: "string" },
          sourceIntent: { type: "string" },
          question: { type: "string" },
          passageExtract: { type: "string" },
          viewBox: { type: "string" },
          choiceDesignFirst: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["choiceNumber", "plannedRole", "reasonBeforeWritingChoice"],
              properties: {
                choiceNumber: { type: "number" },
                plannedRole: { type: "string" },
                reasonBeforeWritingChoice: { type: "string" }
              }
            }
          },
          choices: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["number", "text", "isAnswer", "explanation"],
              properties: {
                number: { type: "number" },
                text: { type: "string" },
                isAnswer: { type: "boolean" },
                explanation: { type: "string" }
              }
            }
          },
          answer: { type: "number" },
          finalExplanation: { type: "string" }
        }
      }
    },
    ox: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "statement", "answer", "explanation", "trap"],
        properties: {
          id: { type: "string" },
          statement: { type: "string" },
          answer: { type: "string", enum: ["O", "X"] },
          explanation: { type: "string" },
          trap: { type: "string" }
        }
      }
    },
    shortAnswer: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "question", "idealAnswer", "gradingPoints", "sampleWrongAnswer"],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          question: { type: "string" },
          idealAnswer: { type: "string" },
          gradingPoints: { type: "array", items: { type: "string" } },
          sampleWrongAnswer: { type: "string" }
        }
      }
    },
    weaknessGuide: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["weakness", "symptom", "howToFix"],
        properties: {
          weakness: { type: "string" },
          symptom: { type: "string" },
          howToFix: { type: "string" }
        }
      }
    }
  }
};
