// 실험용: Responses API 스트리밍 분석 예시
// 안정판 앱에는 기본 연결하지 않았습니다.
// 이유: Structured Outputs 전체 JSON을 스트리밍 중간에 화면에 부분 반영하면
// JSON 스키마 검증, 형광펜 위치 매칭, 마인드맵 렌더링과 충돌하기 쉽기 때문입니다.
// 이 파일은 나중에 서버 프록시/스트리밍 UI로 확장할 때 참고용으로 사용하세요.

export async function streamAnalysisDraft({ apiKey, model, prompt, onText, onDone, onError }) {
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: prompt,
        stream: true
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`stream request failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        const event = JSON.parse(payload);
        const delta = event.delta || event.text || event.output_text || '';
        if (delta) onText?.(delta, event);
      }
    }
    onDone?.();
  } catch (error) {
    onError?.(error);
  }
}
