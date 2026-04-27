export function normalizeDepartmentKey(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";

  const compact = raw.replace(/[_\s]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  if (compact === "frontdesk" || compact === "front-desk") return "front-desk";
  if (compact === "laundry-cleaning" || compact === "laundry") return "laundry-cleaning";

  return compact || "unknown";
}

export function formatDepartmentLabel(value: unknown) {
  const key = normalizeDepartmentKey(value);
  if (key === "unknown") return "Unknown";

  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
