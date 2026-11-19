// 서버 전용: 무료 AI 연결 (키가 있는 곳을 차례로 시도)
//  1) Google Gemini      GEMINI_API_KEY      (모델: GEMINI_MODEL, 기본 gemini-flash-latest → gemini-2.5-flash)
//  2) Groq               GROQ_API_KEY        (모델: GROQ_MODEL, 기본 llama-3.3-70b-versatile)
//  3) OpenRouter         OPENROUTER_API_KEY  (모델: OPENROUTER_MODEL, 기본 meta-llama/llama-3.3-70b-instruct:free)
//  4) OpenAI (유료)      OPENAI_API_KEY      (모델: OPENAI_MODEL, 기본 gpt-4.1-mini → gpt-4o-mini)
// 모두 실패하면 LlmUnavailable을 던지고, 호출한 쪽은 AI 없는 검색으로 답한다.

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  json?: boolean; // JSON으로만 답하게
  maxTokens?: number;
  temperature?: number;
}

export class LlmUnavailable extends Error {}

const TIMEOUT_MS = 20_000;

/** 한도 초과·오류가 난 곳은 잠시 건너뜀 (같은 서버 인스턴스 안에서) */
const G = globalThis as unknown as { __llmCooldown?: Map<string, number> };
const cooldown = (G.__llmCooldown ??= new Map());

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`${res.status} ${text.slice(0, 200)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function gemini(key: string, req: LlmRequest): Promise<string> {
  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ["gemini-flash-latest", "gemini-2.5-flash"];
  let last: unknown;
  for (const model of models) {
    try {
      const j = (await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { "x-goog-api-key": key },
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: {
            temperature: req.temperature ?? 0.3,
            maxOutputTokens: req.maxTokens ?? 1200,
            ...(req.json ? { responseMimeType: "application/json" } : {}),
          },
        },
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text.trim()) return text;
      throw new Error("빈 응답");
    } catch (e) {
      last = e;
      if ((e as { status?: number }).status !== 404) break; // 모델 이름이 없을 때만 다음 모델 시도
    }
  }
  throw last;
}

async function openaiCompatible(url: string, key: string, model: string, req: LlmRequest, extra: Record<string, string> = {}): Promise<string> {
  const j = (await post(
    url,
    { Authorization: `Bearer ${key}`, ...extra },
    {
      model,
      messages: [{ role: "system", content: req.system }, ...req.messages],
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 1200,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    },
  )) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("빈 응답");
  return text;
}

interface Provider {
  name: string;
  run: (req: LlmRequest) => Promise<string>;
}

function providers(): Provider[] {
  const list: Provider[] = [];
  const env = process.env;
  if (env.GEMINI_API_KEY) list.push({ name: "Gemini", run: (r) => gemini(env.GEMINI_API_KEY!, r) });
  if (env.GROQ_API_KEY)
    list.push({
      name: "Groq",
      run: (r) => openaiCompatible("https://api.groq.com/openai/v1/chat/completions", env.GROQ_API_KEY!, env.GROQ_MODEL || "llama-3.3-70b-versatile", r),
    });
  if (env.OPENROUTER_API_KEY)
    list.push({
      name: "OpenRouter",
      run: (r) =>
        openaiCompatible("https://openrouter.ai/api/v1/chat/completions", env.OPENROUTER_API_KEY!, env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", r, {
          "HTTP-Referer": "https://rebound-lab.vercel.app",
          "X-Title": "Rebound Lab",
        }),
    });
  // 유료: 무료 AI가 모두 막혔을 때 마지막으로 사용
  if (env.OPENAI_API_KEY)
    list.push({
      name: "OpenAI",
      run: async (r) => {
        const models = env.OPENAI_MODEL ? [env.OPENAI_MODEL] : ["gpt-4.1-mini", "gpt-4o-mini"];
        let last: unknown;
        for (const m of models) {
          try {
            return await openaiCompatible("https://api.openai.com/v1/chat/completions", env.OPENAI_API_KEY!, m, r);
          } catch (e) {
            last = e;
            const st = (e as { status?: number }).status;
            if (st !== 404 && st !== 400) break;
          }
        }
        throw last;
      },
    });
  return list;
}

export function llmConfigured(): boolean {
  return providers().length > 0;
}

/** 키가 있는 AI를 차례로 시도 */
export async function complete(req: LlmRequest): Promise<{ text: string; provider: string }> {
  const errors: string[] = [];
  for (const p of providers()) {
    const until = cooldown.get(p.name) ?? 0;
    if (Date.now() < until) continue;
    try {
      return { text: await p.run(req), provider: p.name };
    } catch (e) {
      const status = (e as { status?: number }).status;
      errors.push(`${p.name}: ${(e as Error).message.slice(0, 120)}`);
      // 한도 초과(429)는 10분, 그 밖의 오류는 1분 쉬었다가 다시 시도
      cooldown.set(p.name, Date.now() + (status === 429 ? 10 : 1) * 60_000);
    }
  }
  throw new LlmUnavailable(errors.join(" / ") || "AI 키가 설정되지 않았습니다");
}

/** AI가 돌려준 글에서 JSON만 꺼내기 (```json ... ``` 감싸기 대응) */
export function parseJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
