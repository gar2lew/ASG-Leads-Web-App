import { useMemo, useEffect, useRef, useState } from "react";
import { Lead } from "../types";
import { NextAction } from "../lib/nextAction";
import { useUserProfile } from "./useUserProfile";
import type { UserProfile } from "../services/userProfileService";
import { getActionStats, getGlobalActionStats } from "../services/learningService";
import type { ActionStats } from "../services/learningService";
import { updateUserProfile } from "../services/userProfileService";
import { useAppStore } from "../stores/appStore";

/**
 * useAIGuidance.ts — Rule-based sales guidance for client profiles.
 *
 * Entirely local — no API calls, no latency, no cost.
 * Derives contextual suggestions from lead state + next action type.
 */
export interface AIGuidance {
  action: string;
  objection?: { type: "risk" | "price" | "trust" | "timing"; confidence: number };
  script?: string;
  coaching?: string;
  confidenceHint?: string;
}

/**
 * Returns a single contextual guidance item based on the lead's current state.
 * Returns null when no guidance is appropriate (settled, lost, or unknown state).
 *
 * The returned object follows the shape:
 * {
 *   action: string,
 *   objection?: { type: "risk" | "price" | "trust" | "timing", confidence: number },
 *   script?: string,
 *   coaching?: string
 * }
 */
export function useAIGuidance(
  client: Lead | null,
  nextAction: NextAction | null,
  recentNotes: string[] = [], // ← recent notes (last 5) are now supported
  userId?: string,
): AIGuidance | null {
  const profile = useUserProfile(userId ?? null);
  const lastProfileUpdateRef = useRef<number>(0);
  const updateInFlightRef = useRef<boolean>(false);
  const [globalStats, setGlobalStats] = useState<ActionStats[]>([]);
  const { activeRegion } = useAppStore();

  useEffect(() => {
    if (!userId) return;
    if (updateInFlightRef.current) return;
    if (Date.now() - lastProfileUpdateRef.current < 5 * 60 * 1000) return;

    updateInFlightRef.current = true;
    (async () => {
      try {
        const { stats, latestTimestamp } = await getActionStats(userId, activeRegion);
        const lastProcessed = profile?.lastProcessedTimestamp ?? 0;
        if (latestTimestamp <= lastProcessed) return;
        if (stats.length === 0) {
          lastProfileUpdateRef.current = Date.now();
          return;
        }
        await updateUserProfile(userId, stats, latestTimestamp);
        lastProfileUpdateRef.current = Date.now();
      } catch (err) {
        console.warn("[useAIGuidance] profile update failed", err);
      } finally {
        updateInFlightRef.current = false;
      }
    })();
  }, [userId, profile?.lastProcessedTimestamp, activeRegion]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await getGlobalActionStats(activeRegion);
        if (!cancelled) {
          setGlobalStats(stats);
        }
      } catch (err) {
        console.warn("[useAIGuidance] global stats fetch failed", err);
        if (!cancelled) {
          setGlobalStats([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRegion]);

  return useMemo<AIGuidance | null>(() => {
    if (!client || !nextAction) return null;

    // Terminal states — no guidance needed
    if (nextAction.type === "none" || nextAction.type === "settled" || nextAction.type === "lost") {
      return null;
    }

    const name = client.name ?? "this client";
    const fn = firstName(name);
    const context = ownershipContext(client);
    const contextSuffix = context ? ` — they ${context}` : "";

    // ---------- Objection detection ----------
    const detectObjection = (): { type: "risk" | "price" | "trust" | "timing"; confidence: number } | undefined => {
      if (!recentNotes.length) return undefined;
      const categories = [
        { key: "risk", keywords: ["risk", "unsafe", "worried", "scared"], count: 0 },
        { key: "price", keywords: ["expensive", "cost", "afford", "price"], count: 0 },
        { key: "trust", keywords: ["not sure", "dodgy", "scam", "legit"], count: 0 },
        { key: "timing", keywords: ["not now", "later", "busy"], count: 0 },
      ];
      const lowerNotes = recentNotes.map((n) => n.toLowerCase());
      for (const note of lowerNotes) {
        for (const cat of categories) {
          for (const kw of cat.keywords) {
            if (note.includes(kw)) {
              cat.count++;
            }
          }
        }
      }
      const maxCat = categories.reduce((max, cur) => (cur.count > max.count ? cur : max), categories[0]);
      if (maxCat.count === 0) return undefined;
      return { type: maxCat.key as any, confidence: Math.min(maxCat.count / 4, 1) };
    };
    const objection = detectObjection();

    // ---------- Coaching logic ----------
    const daysAgo = Math.floor((Date.now() - new Date(client.lastCall ?? "").getTime()) / 86_400_000);
    let coaching: string | undefined;
    if (daysAgo > 3) {
      coaching = "You’ve delayed this lead — risk of drop-off";
    } else if (objection) {
      coaching = "Address the client’s concern before pushing forward";
    }

    // ---------- Guidance generation ----------
    let suggestion: string = "";
    let defaultScript: string = "";

    // Determine suggestion and default script based on nextAction
    switch (nextAction.type) {
      case "call":
        if (!client.callHistory?.length) {
          suggestion = `${name} hasn't been contacted yet${contextSuffix}. Open with a warm introduction and quickly qualify ownership and super before going further.`;
          defaultScript = `Hi ${fn}, this is [Your Name] from ASG. We specialise in helping WA ${ownerOrRenter(client)} build long-term wealth through property. I just wanted to introduce myself — do you have two minutes?`;
        }
        break;
      case "followup": {
        const when = daysSinceStr(client.lastCall);
        const referencePoint = client.callHistory?.length ? "your last conversation" : "your initial reach-out";
        suggestion = `${name} last heard from you ${when}. Reference ${referencePoint} to re-engage naturally — avoid starting from scratch.`;
        defaultScript = `Hi ${fn}, it's [Your Name] from ASG — we spoke recently about building your financial position. I just wanted to follow up and see where things are at on your end.`;
        break;
      }
      case "confirm":
        suggestion = `${name} has an upcoming appointment. A quick confirmation call reduces no-show risk significantly and builds rapport ahead of the meeting.`;
        defaultScript = `Hi ${fn}, it's [Your Name] from ASG. I'm calling to confirm our upcoming appointment — is that time still working for you? Great, I'll send through a reminder.`;
        break;
      case "callback":
        suggestion = `${name} requested a callback. Call at the scheduled time — they're expecting your call, so lead with confidence.`;
        defaultScript = `Hi ${fn}, it's [Your Name] from ASG — you asked me to call back around this time. Is now still a good moment?`;
        break;
      case "booked": {
        const apptType = client.fcAppt?.date ? "Finance Review" : "Finance Consult";
        suggestion = `${name} is at the right stage for a ${apptType}. Lock in a time while momentum is high — offer two specific time slots rather than an open-ended question.`;
        defaultScript = `Based on what we've discussed, the natural next step is to book a ${apptType}. I have availability on [Day 1] or [Day 2] — which works better for you?`;
        break;
      }
      default:
        return null;
    }

    const action = suggestion;

    // ---------- Script selection with light variation ----------
    // Define multiple script variations per objection type
    const riskScripts = [
      "Totally fair — most clients felt the same before they saw how the numbers work.",
      "That’s a valid concern — usually once we break it down, it becomes much clearer.",
      "I get that — let me show you how we minimise that risk.",
    ];
    const priceScripts = [
      "I appreciate the focus on cost — we’ll highlight the strong value you’ll get for the investment.",
      "That’s a common concern — let me show you exactly what you’re getting for the price.",
      "I understand budgeting is important — here’s how our solution pays for itself over time.",
    ];
    const trustScripts = [
      "I get the hesitation and can share proven results from similar clients.",
      "That’s understandable — we’ve helped many clients in the same position feel more confident.",
      "I can walk you through the track record of clients who started with the same doubts.",
    ];
    const timingScripts = [
      "I see timing isn’t right now — let’s schedule a quick check‑in later this week.",
      "That makes sense — how about we set a reminder and revisit this in a few days?",
      "I completely understand — let me know when the timing works better for you.",
    ];

    let script: string;
    if (objection) {
      const scriptsMap: Record<string, string[]> = {
        risk: riskScripts,
        price: priceScripts,
        trust: trustScripts,
        timing: timingScripts,
      };
      const scripts = scriptsMap[objection.type as keyof typeof scriptsMap] ?? [];
      // Profile-biased variant selection: higher preference → more direct script (index 0)
      // Falls back to random when profile is unavailable
      const idx = selectScriptIndex(scripts.length, nextAction.type, profile, globalStats);
      script = scripts[idx];
    } else {
      script = defaultScript;
    }

    // Build result object matching required shape
    const result: AIGuidance = {
      action,
      script,
    };
    if (objection) {
      result.objection = objection;
    }
    if (coaching) {
      result.coaching = coaching;
    }

    // Confidence hint — only when profile shows a meaningful track record for
    // this action type (score > 2 proxies attempts >= 5 at >= 50% success rate)
    if (profile) {
      const prefKey = actionTypeToPrefKey(nextAction.type);
      if (prefKey && profile.actionPreferences[prefKey] > 2) {
        const label =
          prefKey === "call"
            ? "calling"
            : prefKey === "followup"
              ? "following up"
              : "booking appointments";
        result.confidenceHint = `Based on your recent success with ${label}`;
      }
    }

    return result;
  }, [client, nextAction, recentNotes, profile, globalStats]);
}

/* ── Private helpers ────────────────────────────────────────────────────────────── */

function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

function daysSinceStr(lastCall: string | undefined): string {
  if (!lastCall) return "a while";
  const days = Math.floor((Date.now() - new Date(lastCall).getTime()) / 86_400_000);
  if (days === 1) return "yesterday";
  if (days <= 1) return "recently";
  return `${days} days ago`;
}

function ownershipContext(lead: Lead): string {
  if (lead.ownership === "Owner Occupied") return "owns their own home";
  if (lead.ownership === "Investor") return "is an investor";
  if (lead.ownership === "Renting") return "is currently renting";
  return "";
}

function ownerOrRenter(lead: Lead): string {
  if (lead.ownership === "Owner Occupied") return "homeowners";
  if (lead.ownership === "Investor") return "investors";
  if (lead.ownership === "Renting") return "renters";
  return "Australians";
}

// Maps NextAction type to the matching actionPreferences key.
// Returns null for types with no preference bucket (terminal states, none).
function actionTypeToPrefKey(
  type: string,
): keyof UserProfile["actionPreferences"] | null {
  if (type === "call" || type === "callback") return "call";
  if (type === "followup" || type === "confirm") return "followup";
  if (type === "booked") return "book";
  return null;
}

// Blends user preference and global success rate into a [0, 1] score.
// Weights: user 70%, global 30% when both present.
// Gracefully degrades to single source, or 0.5 (mid-index) when neither is available.
function blendedScoreForAction(
  prefKey: keyof UserProfile["actionPreferences"] | null,
  profile: UserProfile | null,
  globalStats: ActionStats[],
): number {
  const userScore = profile !== null && prefKey !== null
    ? profile.actionPreferences[prefKey]
    : null;
  const userRate = userScore !== null ? (userScore + 5) / 10 : null; // [-5,+5] → [0,1]

  const globalStat = prefKey !== null
    ? globalStats.find((s) => s.action === prefKey)
    : null;
  const globalRate = globalStat?.successRate ?? null; // [0,1]

  if (userRate !== null && globalRate !== null) return userRate * 0.7 + globalRate * 0.3;
  if (userRate !== null) return userRate;
  if (globalRate !== null) return globalRate;
  return 0.5; // neither available — middle index
}

// Selects a script variant index biased by the blended user+global score.
// Higher score → index 0 (most direct/confident script).
function selectScriptIndex(
  count: number,
  actionType: string,
  profile: UserProfile | null,
  globalStats: ActionStats[],
): number {
  if (count <= 1) return 0;
  const prefKey = actionTypeToPrefKey(actionType);
  const score = blendedScoreForAction(prefKey, profile, globalStats);
  return Math.round((1 - score) * (count - 1));
}
