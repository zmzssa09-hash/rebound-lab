// 서버 전용: AI 상담 사용 제한 (유료 AI 비용이 새지 않도록)
// 한 사람(IP)당 하루 CHAT_PER_USER회, 사이트 전체 하루 CHAT_PER_DAY회. 한국 날짜 기준으로 초기화.
// 서버 인스턴스 메모리에 기록하므로 인스턴스가 여러 개면 대략적인 제한이다.
const PER_USER = Number(process.env.CHAT_PER_USER) || 20;
const PER_DAY = Number(process.env.CHAT_PER_DAY) || 300;

const G = globalThis as unknown as { __chatLimit?: { day: string; total: number; users: Map<string, number> } };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export function takeQuota(user: string): { ok: true; left: number } | { ok: false; reason: string } {
  const d = today();
  if (!G.__chatLimit || G.__chatLimit.day !== d) G.__chatLimit = { day: d, total: 0, users: new Map() };
  const s = G.__chatLimit;
  const used = s.users.get(user) ?? 0;
  if (used >= PER_USER) return { ok: false, reason: `오늘 질문 ${PER_USER}번을 모두 쓰셨습니다. 내일(한국 시간 자정 이후) 다시 이용해 주세요.` };
  if (s.total >= PER_DAY) return { ok: false, reason: "오늘 사이트 전체 질문 한도가 다 찼습니다. 내일 다시 이용해 주세요." };
  s.users.set(user, used + 1);
  s.total++;
  return { ok: true, left: PER_USER - used - 1 };
}
