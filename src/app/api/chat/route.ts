import { answer } from "@/lib/chat/engine";
import { takeQuota } from "@/lib/chat/limit";
import type { LlmMessage } from "@/lib/chat/llm";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { messages?: LlmMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) return Response.json({ error: "질문을 입력해 주세요." }, { status: 400 });
  if (last.content.length > 500) return Response.json({ error: "질문은 500자 안으로 써 주세요." }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const q = takeQuota(ip);
  if (!q.ok) return Response.json({ error: q.reason }, { status: 429 });

  try {
    const r = await answer(messages);
    return Response.json({ ...r, left: q.left });
  } catch (e) {
    console.error("AI 상담 실패:", e);
    return Response.json({ error: "답을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}
