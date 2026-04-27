// src/activity/activityStorage.ts
import type { ActivityEvent } from "./activityTypes";

const KEY = "sikatech_activity_events_v1";

// Keep logs small so localStorage never fills up
const MAX_EVENTS = 250;

function safeParse(json: string | null): ActivityEvent[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    return Array.isArray(data) ? (data as ActivityEvent[]) : [];
  } catch {
    return [];
  }
}

export function readActivities(): ActivityEvent[] {
  try {
    return safeParse(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/**
 * Write activities safely.
 * - newest first
 * - capped length
 * - quota-proof (will trim harder if needed)
 * - never throws
 */
export function writeActivities(items: ActivityEvent[]): void {
  try {
    const normalized = Array.isArray(items) ? items : [];
    const newestFirst = [...normalized].sort((a, b) => b.timestamp - a.timestamp);

    // First trim to normal cap
    let trimmed = newestFirst.slice(0, MAX_EVENTS);

    // Try writing (may throw quota error)
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
      return;
    } catch {
      // If quota hits, trim more aggressively and retry a few times
      for (const cap of [150, 100, 50, 20]) {
        try {
          trimmed = newestFirst.slice(0, cap);
          localStorage.setItem(KEY, JSON.stringify(trimmed));
          return;
        } catch {
          // continue
        }
      }

      // If still failing, remove the key so UI never crashes
      try {
        localStorage.removeItem(KEY);
      } catch {
        // ignore
      }
    }
  } catch {
    // never crash UI
  }
}

export function appendActivity(event: ActivityEvent): void {
  const current = readActivities();
  writeActivities([event, ...current]);
}

export function clearActivities(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}






