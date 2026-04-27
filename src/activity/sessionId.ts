// src/activity/sessionId.ts
export function getSessionId() {
  const key = "sikatech.sessionId";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const sid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  sessionStorage.setItem(key, sid);
  return sid;
}
