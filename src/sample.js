export const SAMPLE_PASSAGE = `기술은 인간의 삶을 편리하게 만들지만, 그 편리함이 언제나 인간의 자유를 확대하는 것은 아니다. 예컨대 추천 알고리즘은 사용자가 원하는 정보를 빠르게 제공하는 듯 보이지만, 동시에 사용자가 마주하는 세계의 폭을 좁힐 수 있다. 이때 문제는 기술 자체가 아니라, 기술이 인간의 판단을 대신하기 시작하는 방식에 있다.

전통적으로 도구는 인간의 목적을 실현하기 위한 수단으로 이해되었다. 망치는 못을 박기 위해 사용되고, 지도는 길을 찾기 위해 사용된다. 이 경우 도구의 기능은 비교적 분명하며, 인간은 도구 사용의 방향을 스스로 결정한다. 그러나 오늘날의 지능형 기술은 사용자의 선택을 예측하고, 선택지를 배열하며, 때로는 무엇을 선택해야 하는지 암묵적으로 유도한다.

물론 이러한 기술이 반드시 부정적인 것만은 아니다. 복잡한 의료 정보를 분석하거나 재난 상황에서 빠른 판단을 돕는 기술은 인간의 한계를 보완한다. 다만 기술이 제공하는 결과가 객관적이고 중립적이라는 믿음이 강해질수록, 사용자는 그 결과가 어떤 기준과 데이터에 의해 구성되었는지 묻지 않게 된다.

따라서 중요한 것은 기술을 거부하는 태도가 아니라, 기술의 판단 과정을 비판적으로 이해하는 태도이다. 인간은 기술의 도움을 받을 수 있지만, 그 도움을 최종 판단으로 착각해서는 안 된다. 기술이 제시한 선택지가 어떤 가능성을 열고 어떤 가능성을 닫는지 살피는 일이야말로, 기술 시대의 자유를 지키는 조건이다.`;

export function createDemoAnalysis(passage = SAMPLE_PASSAGE) {
  const paragraphs = passage.split(/\n\s*\n/).filter(Boolean).map((text, i) => ({
    id: `p${i + 1}`,
    index: i + 1,
    role: ["문제 제기", "개념 대조", "균형 잡힌 평가", "결론 및 태도 제안"][i] || "내용 전개",
    summary: [
      "기술의 편리함이 곧 자유의 확대를 의미하지 않으며, 판단을 대신하는 방식이 문제가 됨을 제기한다.",
      "전통적 도구와 지능형 기술을 대비하여, 현대 기술이 선택 자체에 개입함을 설명한다.",
      "기술의 긍정적 기능을 인정하되, 중립성에 대한 무비판적 믿음을 경계한다.",
      "기술 거부가 아니라 판단 과정을 비판적으로 이해하는 태도가 필요하다고 결론짓는다."
    ][i] || text.slice(0, 80),
    coreClaim: [
      "기술은 인간의 판단을 대신할 때 자유를 좁힐 수 있다.",
      "지능형 기술은 단순 도구와 달리 선택지를 배열하고 유도한다.",
      "기술은 유용하지만 그 결과의 구성 기준을 물어야 한다.",
      "기술의 도움과 최종 판단을 구분해야 한다."
    ][i] || "핵심 내용",
    keywords: [
      ["기술", "자유", "판단", "추천 알고리즘"],
      ["전통적 도구", "지능형 기술", "선택지 배열"],
      ["중립성", "데이터", "비판적 질문"],
      ["비판적 이해", "최종 판단", "가능성"]
    ][i] || ["핵심어"],
    connections: ["앞뒤 문단과 원인·대조·결론 관계로 이어진다."]
  }));
  return {
    cleanedPassage: passage,
    title: "기술 시대의 자유와 비판적 판단",
    field: "인문·기술철학",
    difficulty: {
      level: "중상",
      score: 4.0,
      reason: "추상 개념과 비교대조가 많고, 기술의 긍정/부정을 단순히 나누지 않는 균형적 관점이 핵심이다.",
      criteria: [
        { name: "개념 밀도", score: 4, reason: "자유, 판단, 중립성, 비판적 이해가 연결된다." },
        { name: "문장 난도", score: 3.5, reason: "문장은 비교적 명확하지만 추상어가 많다." },
        { name: "구조 복잡도", score: 4, reason: "문제 제기-대조-균형-결론 구조를 따라야 한다." },
        { name: "추론 요구도", score: 4, reason: "보기 적용 시 가능성을 여는 면과 닫는 면을 함께 봐야 한다." },
        { name: "선지 함정 가능성", score: 4.5, reason: "기술 거부론으로 오해하거나 편리함과 자유를 동일시하기 쉽다." }
      ],
      trapPoints: ["기술 자체를 부정한다고 오해하기", "편리함과 자유를 동일시하기", "객관성과 중립성을 혼동하기"]
    },
    overallSummary: "이 글은 지능형 기술이 편리함을 제공하는 동시에 인간의 선택과 판단에 개입할 수 있음을 지적한다. 필자는 기술을 거부하자는 것이 아니라, 기술의 판단 과정과 기준을 비판적으로 이해해야 기술 시대의 자유를 지킬 수 있다고 본다.",
    readingGuide: "처음에는 ‘기술=편리함’이라는 익숙한 생각을 흔들고, 중간에서는 전통적 도구와 지능형 기술을 대비하며, 마지막에는 기술을 비판적으로 활용해야 한다는 결론으로 간다.",
    paragraphs,
    flow: ["문제 제기", "전통적 도구와 현대 기술 대조", "기술의 긍정성 인정", "비판적 이해의 필요성"],
    structureTimeline: [
      { label: "문제 제기", paragraphIds: ["p1"], description: "기술의 편리함이 자유를 줄일 수도 있음을 제시한다." },
      { label: "대조", paragraphIds: ["p2"], description: "전통적 도구와 지능형 기술의 차이를 비교한다." },
      { label: "균형", paragraphIds: ["p3"], description: "기술의 유용성을 인정하면서도 중립성 믿음을 경계한다." },
      { label: "결론", paragraphIds: ["p4"], description: "비판적 이해가 기술 시대 자유의 조건임을 밝힌다." }
    ],
    highlights: [
      { id: "h1", paragraphId: "p1", text: "그 편리함이 언제나 인간의 자유를 확대하는 것은 아니다", type: "핵심 주장", color: "claim", shortReason: "글의 문제의식", detail: "기술의 편리함과 자유의 관계를 분리해 보는 출발점이다." },
      { id: "h1b", paragraphId: "p1", text: "그 편리함이 언제나 인간의 자유를 확대하는 것은 아니다", type: "주의", color: "warning", shortReason: "편리함=자유 확대라는 오해 주의", detail: "선지에서 편리함을 곧 자유로 바꿔 쓰면 오답이 된다." },
      { id: "h2", paragraphId: "p1", text: "기술이 인간의 판단을 대신하기 시작하는 방식", type: "쟁점", color: "warning", shortReason: "비판의 대상", detail: "문제는 기술 자체가 아니라 판단을 대체하는 방식에 있다는 점이 중요하다." },
      { id: "h3", paragraphId: "p2", text: "전통적으로 도구는 인간의 목적을 실현하기 위한 수단", type: "정의", color: "definition", shortReason: "전통적 도구 설명", detail: "이 설명이 뒤의 지능형 기술과 대조된다." },
      { id: "h4", paragraphId: "p2", text: "선택지를 배열하며", type: "비교대조", color: "contrast", shortReason: "현대 기술의 차이", detail: "현대 기술은 단순 수단이 아니라 선택 환경을 설계한다." },
      { id: "h5", paragraphId: "p3", text: "반드시 부정적인 것만은 아니다", type: "균형", color: "support", shortReason: "극단적 해석 방지", detail: "필자는 기술 반대론자가 아니라 조건부 수용의 입장을 취한다." },
      { id: "h6", paragraphId: "p4", text: "기술을 거부하는 태도가 아니라", type: "결론", color: "claim", shortReason: "필자의 최종 입장", detail: "기술 거부가 아니라 비판적 이해가 핵심이다." },
      { id: "h7", paragraphId: "p4", text: "어떤 가능성을 열고 어떤 가능성을 닫는지", type: "추론 포인트", color: "evidence", shortReason: "보기 적용 포인트", detail: "보기 문제에서는 기술이 제공하는 선택의 양면성을 따져야 한다." }
    ],
    comparisons: [
      { id: "c1", axis: "도구의 역할", a: "전통적 도구: 인간 목적의 수단", b: "지능형 기술: 선택 예측·배열·유도", meaning: "현대 기술은 인간의 선택 환경 자체에 개입한다.", paragraphIds: ["p2"], sourceDetail: "2문단에서 망치·지도는 기능이 분명한 수단으로, 지능형 기술은 선택을 예측·배열·유도하는 것으로 제시된다." },
      { id: "c2", axis: "기술 태도", a: "무조건 거부", b: "비판적 이해와 활용", meaning: "필자의 입장은 거부가 아니라 판단 과정에 대한 성찰이다.", paragraphIds: ["p4"], sourceDetail: "4문단에서 '기술을 거부하는 태도가 아니라'라는 표현 뒤에 비판적 이해가 결론으로 제시된다." }
    ],
    glossary: [
      { term: "추천 알고리즘", meaning: "사용자의 과거 행동을 바탕으로 콘텐츠나 정보를 제안하는 체계", inTextMeaning: "선택의 폭을 넓히는 듯하지만 좁힐 수도 있는 사례", sourceText: "추천 알고리즘은 사용자가 원하는 정보를 빠르게 제공하는 듯 보이지만", paragraphIds: ["p1"], easyExample: "영상을 보면 비슷한 영상만 계속 추천되는 것" },
      { term: "중립성", meaning: "어느 한쪽으로 치우치지 않았다는 성질", inTextMeaning: "기술 결과가 아무 기준 없이 객관적이라고 믿는 태도와 관련됨", sourceText: "객관적이고 중립적이라는 믿음", paragraphIds: ["p3"], easyExample: "검색 결과 순서가 완전히 공평하다고 믿는 것" },
      { term: "비판적 이해", meaning: "대상을 무조건 거부하지 않고 작동 원리와 한계를 따져 보는 태도", inTextMeaning: "기술 시대 자유를 지키기 위한 태도", sourceText: "기술의 판단 과정을 비판적으로 이해하는 태도", paragraphIds: ["p4"], easyExample: "AI 추천을 보되 왜 추천됐는지 의심해 보는 것" }
    ],
    trickySentences: [
      { sentence: "기술이 인간의 판단을 대신하기 시작하는 방식에 있다.", paragraphId: "p1", whyHard: "기술 자체가 나쁘다는 뜻이 아니라 판단 대체 방식이 문제라는 제한이 들어 있다.", easyRewrite: "기술을 전부 나쁘다고 말하는 것이 아니다. 사용자가 스스로 판단해야 할 부분까지 기술이 대신 정해 주기 시작할 때 자유가 줄어들 수 있다는 뜻이다.", testPoint: "필자의 입장을 기술 거부론으로 오해하지 않는지 묻기 좋다." },
      { sentence: "기술이 제시한 선택지가 어떤 가능성을 열고 어떤 가능성을 닫는지 살피는 일", paragraphId: "p4", whyHard: "‘가능성을 연다/닫는다’는 추상 표현이 들어 있다.", easyRewrite: "기술이 어떤 일을 쉽게 하도록 도와주는지와 동시에, 어떤 선택지를 보지 못하게 만드는지를 함께 따져야 한다는 뜻이다.", testPoint: "보기 적용 문제에서 핵심 판단 기준이 된다." }
    ],
    mindmap: {
      nodes: [
        { id: "main", label: "기술 시대의 자유", kind: "center", summary: "편리함과 자유의 관계를 비판적으로 검토한다." },
        { id: "problem", label: "판단 대체", kind: "issue", summary: "기술이 인간의 선택을 대신할 때 문제가 생긴다." },
        { id: "contrast", label: "도구 vs 지능형 기술", kind: "contrast", summary: "전통적 도구와 현대 기술의 역할 차이." },
        { id: "balance", label: "유용성 인정", kind: "support", summary: "기술은 인간의 한계를 보완할 수 있다." },
        { id: "attitude", label: "비판적 이해", kind: "claim", summary: "거부가 아니라 작동 방식에 대한 성찰이 필요하다." }
      ],
      edges: [
        { source: "main", target: "problem", label: "문제의식" },
        { source: "problem", target: "contrast", label: "설명" },
        { source: "contrast", target: "balance", label: "균형" },
        { source: "balance", target: "attitude", label: "결론" },
        { source: "attitude", target: "main", label: "자유의 조건" }
      ]
    },
    studyTips: ["‘기술이 나쁘다’가 아니라 ‘기술의 판단 과정을 이해해야 한다’가 핵심이다.", "보기 문제에서는 기술이 어떤 가능성을 열고 닫는지 따져라.", "전통적 도구와 지능형 기술의 차이를 정리하면 글 전체가 잡힌다."],
    suggestedReaderQuestions: [
      "추천 알고리즘이 자유를 넓히는지 좁히는지 헷갈려요",
      "전통적 도구와 지능형 기술의 차이를 예시로 설명해줘",
      "기술을 거부하지 말라는 결론이 선지로 나오면 어디가 함정이 돼?",
      "기술의 중립성을 믿는 태도가 왜 문제가 되는지 설명해줘"
    ]
  };
}

export function createDemoQuestions() {
  return {
    multipleChoice: [
      {
        id: "q1",
        type: "개념 확인 - 내용 일치",
        difficulty: "중",
        sourceIntent: "기술 자체가 문제가 아니라 판단을 대신하는 방식이 문제라는 핵심 입장을 확인한다.",
        question: "윗글의 내용과 일치하는 것은?",
        passageExtract: "이때 문제는 기술 자체가 아니라, 기술이 인간의 판단을 대신하기 시작하는 방식에 있다.",
        viewBox: "",
        choiceDesignFirst: [
          { choiceNumber: 1, plannedRole: "오답", reasonBeforeWritingChoice: "필자를 기술 거부론자로 오해하게 만든다." },
          { choiceNumber: 2, plannedRole: "오답", reasonBeforeWritingChoice: "추천 알고리즘의 기능을 무조건 긍정하게 만든다." },
          { choiceNumber: 3, plannedRole: "정답", reasonBeforeWritingChoice: "기술의 판단 대체 방식이 문제라는 핵심을 반영한다." },
          { choiceNumber: 4, plannedRole: "오답", reasonBeforeWritingChoice: "전통적 도구와 지능형 기술의 차이를 지운다." },
          { choiceNumber: 5, plannedRole: "오답", reasonBeforeWritingChoice: "기술의 객관성을 필자가 인정한다고 왜곡한다." }
        ],
        choices: [
          { number: 1, text: "필자는 인간의 자유를 지키기 위해 모든 지능형 기술을 거부해야 한다고 본다.", isAnswer: false, explanation: "필자는 거부가 아니라 비판적 이해를 주장한다." },
          { number: 2, text: "추천 알고리즘은 사용자의 세계를 언제나 넓혀 주는 기술로 제시된다.", isAnswer: false, explanation: "오히려 세계의 폭을 좁힐 수 있다고 했다." },
          { number: 3, text: "필자는 기술 자체보다 기술이 인간의 판단을 대신하는 방식에 주목한다.", isAnswer: true, explanation: "지문의 핵심 문제의식과 일치한다." },
          { number: 4, text: "전통적 도구와 지능형 기술은 모두 사용자의 선택에 개입하지 않는다는 점에서 같다.", isAnswer: false, explanation: "지능형 기술은 선택지를 배열하고 유도할 수 있다." },
          { number: 5, text: "필자는 기술이 제공하는 결과가 중립적이라는 믿음을 강화해야 한다고 본다.", isAnswer: false, explanation: "그 믿음을 경계해야 한다고 본다." }
        ],
        answer: 3,
        finalExplanation: "정답은 ③이다. 이 글은 기술 자체의 악함이 아니라 판단을 대신하는 방식의 위험성을 문제 삼는다."
      },
      {
        id: "q2",
        type: "보기 적용",
        difficulty: "상",
        sourceIntent: "보기 사례에 글의 핵심 개념을 적용하는 능력을 평가한다.",
        question: "<보기>를 활용하여 윗글을 이해한 내용으로 가장 적절한 것은?",
        passageExtract: "기술이 제시한 선택지가 어떤 가능성을 열고 어떤 가능성을 닫는지 살피는 일",
        viewBox: "<보기> 한 독서 앱은 사용자의 독서 기록을 바탕으로 비슷한 주제의 책만 계속 추천한다. 사용자는 빠르게 취향에 맞는 책을 찾지만, 낯선 분야의 책을 접할 기회는 줄어든다.",
        choiceDesignFirst: [
          { choiceNumber: 1, plannedRole: "오답", reasonBeforeWritingChoice: "편리함만 보고 자유가 확대된다고 단정하게 만든다." },
          { choiceNumber: 2, plannedRole: "정답", reasonBeforeWritingChoice: "가능성을 여는 면과 닫는 면을 함께 파악한다." },
          { choiceNumber: 3, plannedRole: "오답", reasonBeforeWritingChoice: "기술의 유용성을 전면 부정한다." },
          { choiceNumber: 4, plannedRole: "오답", reasonBeforeWritingChoice: "기술 결과의 중립성을 무비판적으로 받아들인다." },
          { choiceNumber: 5, plannedRole: "오답", reasonBeforeWritingChoice: "전통적 도구와 지능형 기술의 차이를 혼동한다." }
        ],
        choices: [
          { number: 1, text: "독서 앱이 사용자의 취향을 맞히므로 사용자의 자유는 무조건 확대된다.", isAnswer: false, explanation: "낯선 분야를 접할 가능성이 줄어드는 면을 무시했다." },
          { number: 2, text: "독서 앱은 원하는 책을 빨리 찾게 해 주지만, 동시에 사용자가 만나는 책의 범위를 좁힐 수 있다.", isAnswer: true, explanation: "가능성을 여는 면과 닫는 면을 함께 본다." },
          { number: 3, text: "독서 앱은 선택을 유도하므로 어떤 경우에도 사용되어서는 안 된다.", isAnswer: false, explanation: "필자는 기술 거부가 아니라 비판적 이해를 말한다." },
          { number: 4, text: "독서 앱의 추천 결과는 데이터에 근거하므로 사용자는 그 기준을 따져 볼 필요가 없다.", isAnswer: false, explanation: "필자는 기준과 데이터가 무엇인지 물어야 한다고 본다." },
          { number: 5, text: "독서 앱은 지도나 망치와 같이 사용자의 선택지 배열에 관여하지 않는 도구이다.", isAnswer: false, explanation: "보기의 앱은 선택지를 계속 추천하고 배열한다." }
        ],
        answer: 2,
        finalExplanation: "정답은 ②이다. 보기의 핵심은 편리함과 선택 범위 축소가 동시에 나타난다는 점이다."
      }
    ],
    ox: [
      { id: "ox1", statement: "필자는 기술의 도움을 받을 수는 있지만, 그것을 최종 판단으로 착각해서는 안 된다고 본다.", answer: "O", explanation: "4문단의 결론과 일치한다.", trap: "기술 활용과 기술 의존을 구분해야 한다." },
      { id: "ox2", statement: "윗글에서 추천 알고리즘은 사용자가 마주하는 세계의 폭을 반드시 넓히는 예로 제시된다.", answer: "X", explanation: "세계의 폭을 좁힐 수 있는 예로 제시된다.", trap: "‘빠르게 제공’이라는 긍정 표현에 끌리면 틀린다." },
      { id: "ox3", statement: "필자는 기술의 결과가 객관적이고 중립적이라는 믿음이 강해질수록 사용자가 질문하지 않게 될 수 있다고 본다.", answer: "O", explanation: "3문단의 내용과 일치한다.", trap: "객관성과 중립성에 대한 무비판적 신뢰가 핵심 함정이다." }
    ],
    shortAnswer: [
      { id: "s1", type: "이유 설명", question: "필자가 기술 자체가 아니라 ‘기술이 인간의 판단을 대신하기 시작하는 방식’을 문제 삼은 이유를 서술하시오.", idealAnswer: "기술은 인간의 한계를 보완할 수 있지만, 선택지를 배열하고 유도하면서 인간이 스스로 판단할 기회를 줄일 수 있기 때문이다.", gradingPoints: ["기술 자체 부정이 아님", "판단 대체/선택 유도 언급", "자유 축소 가능성 언급"], sampleWrongAnswer: "기술은 인간에게 해롭기 때문이다." },
      { id: "s2", type: "비교대조 설명", question: "전통적 도구와 지능형 기술의 차이를 2가지 이상 서술하시오.", idealAnswer: "전통적 도구는 인간의 목적을 실현하는 수단이며 사용 방향을 인간이 정한다. 반면 지능형 기술은 선택을 예측하고 선택지를 배열하며 사용자를 특정 방향으로 유도할 수 있다.", gradingPoints: ["전통적 도구의 수단성", "지능형 기술의 예측/배열/유도", "선택 환경 개입"], sampleWrongAnswer: "둘 다 편리한 기술이라는 점에서 같다." }
    ],
    weaknessGuide: [
      { weakness: "필자 관점 오해", symptom: "기술 거부론으로 읽음", howToFix: "‘거부가 아니라 비판적 이해’라는 결론 문장을 기준으로 선지를 판단한다." },
      { weakness: "보기 적용 약함", symptom: "사례의 긍정적 측면만 보고 답을 고름", howToFix: "기술이 여는 가능성과 닫는 가능성을 함께 표시한다." }
    ]
  };
}
