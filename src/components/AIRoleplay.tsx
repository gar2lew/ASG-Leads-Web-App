/**
 * AIRoleplay.tsx — AI Roleplay Training System (Enhanced)
 *
 * Features:
 *  - Persona system with 5 realistic client types
 *  - Rich objection library per scenario with 3 tiers
 *  - Conversation flow: neutral → resistance → softening
 *  - Objection injection every 2-3 exchanges
 *  - Improved scoring (objection handling, questioning, closing)
 *  - Firestore persistence
 *
 * AI behavior rules:
 *  - Keep responses short (1-2 sentences)
 *  - Do not assist the user
 *  - Push back with objections naturally
 *  - Gradually soften if user performs well
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAppStore } from "../stores/appStore";
import {
  MessageSquare,
  Send,
  Loader,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  Play,
  Star,
  Target,
  XCircle,
  CheckCircle,
  Clock,
  User,
  Mic,
  MicOff,
  VolumeX,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { useSpeechToText, type STTStatus } from "../hooks/useSpeechToText";
import { useTextToSpeech } from "../hooks/useTextToSpeech";
import { useScripts, type TrainingScript } from "../hooks/useScripts";
import { useAppSettings } from "../hooks/useAppSettings";
import { analyseSession, type SessionFeedback } from "../lib/sessionFeedback";
import type { SectionScores, StructuredFeedback } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Audio utilities (browser Web Audio API — no files required)
// ─────────────────────────────────────────────────────────────────────────────

/** Short soft-click confirmation sound played when mic activates */
function playClickSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
    // Auto-close after the sound finishes
    setTimeout(() => ctx.close().catch(() => {}), 200);
  } catch {
    // Silently ignore — Web Audio may not be available in all contexts
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ScenarioType = "booking_call" | "door_knock" | "first_consult" | "follow_up" | "property_sale";
export type Difficulty = "easy" | "medium" | "hard";
export type SessionState = "setup" | "active" | "ended";
export type PersonaType =
  | "skeptical_professional"
  | "time_poor_parent"
  | "price_sensitive"
  | "friendly_non_committal"
  | "motivated_seller";

interface ChatMessage {
  id: string;
  role: "user" | "ai" | "system";
  text: string;
  timestamp: number;
}

interface SessionScore {
  objectionHandling: number;
  questioning: number;
  closing: number;
  total: number;
  // ── Analysis fields (v2) ─────────────────────────────────────────────────
  questionsAsked: number;
  hesitations: number; // very short replies (< 12 chars)
  ignoredObjections: number; // AI objections user didn't acknowledge
  closingAttemptExchange: number; // exchange number of first close attempt (0 = never)
}

interface Persona {
  id: PersonaType;
  label: string;
  emoji: string;
  demeanor: string;
  communicationStyle: string;
  primaryConcerns: string[];
  softensWhen: string;
  hardensWhen: string;
  openingVariant: string;
}

interface ObjectionTier {
  tier: "soft" | "moderate" | "hard";
  items: string[];
}

interface ScenarioDef {
  id: ScenarioType;
  label: string;
  icon: string;
  goal: string;
  description: string;
  maxExchanges: number;
  objectionTiers: ObjectionTier[];
  neutralOpeners: string[];
  positiveClosers: string[];
  shutdownLines: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona Definitions
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAS: Record<PersonaType, Persona> = {
  skeptical_professional: {
    id: "skeptical_professional",
    label: "Skeptical Professional",
    emoji: "🧐",
    demeanor: "Analytical, guarded, values competence over charm",
    communicationStyle: "Asks pointed questions, expects evidence, dismisses fluff",
    primaryConcerns: ["credibility", "process clarity", "time waste"],
    softensWhen: "you demonstrate expertise with specific details",
    hardensWhen: "you give vague answers or oversell",
    openingVariant: "Hello? Yes, this is them. What's this regarding?",
  },
  time_poor_parent: {
    id: "time_poor_parent",
    label: "Time-Poor Parent",
    emoji: "⏰",
    demeanor: "Distracted, busy, trying to be polite but rushed",
    communicationStyle: "Short responses, multitasking, wants the bottom line fast",
    primaryConcerns: ["time", "disruption", "family logistics"],
    softensWhen: "you respect their time and get straight to the point",
    hardensWhen: "you ramble or ask for long conversations",
    openingVariant: "Hi, I've only got a minute — what's this about?",
  },
  price_sensitive: {
    id: "price_sensitive",
    label: "Price-Sensitive",
    emoji: "💰",
    demeanor: "Frugal, cautious, worried about hidden costs",
    communicationStyle: "Focuses on money, asks about fees, compares options",
    primaryConcerns: ["cost", "value for money", "hidden fees"],
    softensWhen: "you're transparent about costs and show clear value",
    hardensWhen: "you dodge cost questions or seem evasive",
    openingVariant: "Hello? Is this going to cost me anything to talk?",
  },
  friendly_non_committal: {
    id: "friendly_non_committal",
    label: "Friendly but Non-Committal",
    emoji: "😊",
    demeanor: "Warm and pleasant but avoids decisions",
    communicationStyle: "Agreeable, deflects with niceness, says 'maybe later'",
    primaryConcerns: ["commitment pressure", "making the wrong choice", "being sold to"],
    softensWhen: "you create a no-pressure environment and offer easy next steps",
    hardensWhen: "you push for commitment or create urgency",
    openingVariant: "Oh hi there! Yes, I'm fine thanks. What can I do for you?",
  },
  motivated_seller: {
    id: "motivated_seller",
    label: "Motivated Seller",
    emoji: "🏠",
    demeanor: "Genuinely interested, has a timeline, wants results",
    communicationStyle: "Direct, asks practical questions, ready to engage",
    primaryConcerns: ["timeline", "realistic expectations", "trust"],
    softensWhen: "you show a clear path forward with realistic timelines",
    hardensWhen: "you oversell or make unrealistic promises",
    openingVariant: "Hi, yes — I've actually been expecting a call about this. Tell me more.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Scenario Definitions with Rich Objection Libraries
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIOS: ScenarioDef[] = [
  {
    id: "booking_call",
    label: "Booking a Call",
    icon: "phone",
    goal: "Book a face-to-face appointment with the homeowner",
    description:
      "You've just called a homeowner about selling. They're vaguely interested but cautious. Secure a 30-minute consultation.",
    maxExchanges: 12,
    objectionTiers: [
      {
        tier: "soft",
        items: [
          "Oh, okay. I've been thinking about downsizing actually. What did you want to know?",
          "Sure, I've got a minute. What's this about exactly?",
          "Alright, I'm listening. What can you tell me?",
          "Hmm, interesting. How does this process work?",
          "Okay, I suppose I could hear you out briefly.",
          "I've had a few people reach out lately. What's different about you?",
          "I'm curious but I need more details before I commit to anything.",
        ],
      },
      {
        tier: "moderate",
        items: [
          "How did you get my number? I haven't listed anything anywhere.",
          "I'm not sure I'm ready to sell yet. The market seems quiet.",
          "Is there any cost involved? I don't want to waste my time.",
          "I've had people call before and nothing came of it. Why would this be different?",
          "I'd need to think about it. Can you send me some information first?",
          "I've spoken to a few companies already and I'm not impressed.",
          "My partner would need to be involved in any decision like this.",
          "What's the catch? These calls always sound too good to be true.",
          "I don't usually do business over the phone. This feels a bit impersonal.",
          "We're not in any rush to sell. Why should I act now?",
        ],
      },
      {
        tier: "hard",
        items: [
          "Look, I'm really not interested. Please take me off your list.",
          "We get calls about this all the time. We're staying put.",
          "I don't talk to people I don't know on the phone. Goodbye.",
          "No thanks. We've already made our decision about the property.",
          "I'm going to hang up now. Please don't call again.",
          "This is harassment. How many times do I need to say no?",
          "I've told three people already — we're not selling. Stop calling.",
        ],
      },
    ],
    neutralOpeners: [
      "Hello? Yes, this is them.",
      "Hi, you've reached [name]. What's this about?",
      "Hello? Yes, go on then.",
    ],
    positiveClosers: [
      "Alright, that actually sounds worthwhile. When can we meet?",
      "Okay, I'm convinced. Let's set something up for next week.",
      "You know what, sure. I'd like to hear more in person.",
      "Fine, you've got me interested. What day works for you?",
    ],
    shutdownLines: [
      "I've said no clearly. Goodbye.",
      "Please remove my number. I'm hanging up now.",
      "I'm not interested and that's final.",
    ],
  },
  {
    id: "door_knock",
    label: "Door Knock",
    icon: "door",
    goal: "Qualify the homeowner and book a follow-up consultation",
    description:
      "You're at the door of a homeowner. They've opened but look surprised. Introduce yourself and book a follow-up.",
    maxExchanges: 10,
    objectionTiers: [
      {
        tier: "soft",
        items: [
          "Oh, right. Come in briefly I suppose. What's this about?",
          "Okay, I've got a couple minutes. Make it quick though.",
          "Sure, I'm curious. What do you do exactly?",
          "Alright, go on then. I've heard worse pitches at my door.",
          "Oh, I see. Well, I suppose it doesn't hurt to listen.",
          "Okay, you caught me at a decent time. What's your pitch?",
        ],
      },
      {
        tier: "moderate",
        items: [
          "I wasn't expecting anyone. What is this about exactly?",
          "We're not really looking to sell right now. Is there a point to this?",
          "I don't usually talk to people who just show up. Can you leave a card?",
          "Honestly, I'm pretty busy. Could we schedule a proper time?",
          "I'd need to discuss with my partner. Can you come back later?",
          "We've already got someone helping us. Thanks though.",
          "I appreciate the initiative but we're not looking at this right now.",
          "Door knocks make me uncomfortable. Is there a better way to connect?",
        ],
      },
      {
        tier: "hard",
        items: [
          "No thanks, we're not interested. Please leave.",
          "We have a no-soliciting policy. I need you to leave.",
          "I don't talk to strangers at my door. Goodbye.",
          "Not interested. Please don't come back.",
          "This is private property. You need to leave now.",
          "I'm calling the police if you don't leave.",
        ],
      },
    ],
    neutralOpeners: ["Oh... hello. Can I help you?", "Hi? Yes? What is it?", "Hello. Were you looking for someone?"],
    positiveClosers: [
      "Alright, come back tomorrow and we'll have a proper chat.",
      "Sure, leave your card and I'll call you this week.",
      "Okay, that was actually helpful. Let's set a time.",
    ],
    shutdownLines: [
      "I need you to leave. Now.",
      "Not interested. Goodbye.",
      "Please go. I'm not having this conversation.",
    ],
  },
  {
    id: "first_consult",
    label: "First Consultation",
    icon: "meeting",
    goal: "Gather property details and establish trust for the next step",
    description:
      "First meeting with a homeowner. Understand their situation, build rapport, set up the next consultation.",
    maxExchanges: 14,
    objectionTiers: [
      {
        tier: "soft",
        items: [
          "Thanks for coming. I've been looking into my options. Tell me more.",
          "Sure, I'm happy to chat. What do you need to know about my situation?",
          "I've been thinking about this for a while. Let's talk it through.",
          "I'm open to the conversation. What's your approach?",
          "Good, I want to understand the full picture before deciding anything.",
          "I appreciate you taking the time. Let's get into it.",
        ],
      },
      {
        tier: "moderate",
        items: [
          "I've met with a couple of others already. What makes you different?",
          "I need to understand the process better before I commit to anything.",
          "Can you walk me through exactly what happens at each stage?",
          "What kind of timeline are we looking at if I go ahead?",
          "How do I know I can trust you with something this important?",
          "I want references or case studies before I go further.",
          "What happens if things don't go to plan? What's the exit?",
          "Your numbers seem a bit optimistic. Are these realistic?",
        ],
      },
      {
        tier: "hard",
        items: [
          "Honestly, I'm not convinced yet. I need more information.",
          "The last person I spoke with couldn't answer my questions properly.",
          "I'm leaning towards not going ahead. Convince me otherwise.",
          "I'm getting a lot of mixed signals. This feels disorganised.",
          "I think I need to step back and reconsider whether this is right.",
        ],
      },
    ],
    neutralOpeners: [
      "Hi, thanks for meeting with me today. I appreciate your time.",
      "Good to meet you. Shall we get started?",
      "Thanks for having me. I've brought some information to go through.",
    ],
    positiveClosers: [
      "That all makes sense. I'd like to move to the next step.",
      "I'm impressed with your approach. What do we do next?",
      "You've addressed my concerns. Let's keep going.",
    ],
    shutdownLines: [
      "I don't think this is the right fit for us. Thank you though.",
      "I need to reconsider. I'll be in touch if things change.",
    ],
  },
  {
    id: "follow_up",
    label: "Follow-Up Call",
    icon: "callback",
    goal: "Re-engage a lead who went cold and move them to the next stage",
    description:
      "Following up with a lead from last week. Re-engage and either book an appointment or get a clear answer.",
    maxExchanges: 10,
    objectionTiers: [
      {
        tier: "soft",
        items: [
          "Oh right, yes. I remember our chat. Sorry I've been flat out.",
          "Hey! Yeah, I've been giving it some thought actually.",
          "Good timing — I had a few questions I wanted to ask.",
          "Oh hi, yes. I was meaning to get back to you.",
          "Sure, I've had some time to reflect. What's on your mind?",
          "Yeah, it's good to hear from you. I've got a few minutes.",
        ],
      },
      {
        tier: "moderate",
        items: [
          "Yeah I remember, but honestly I've been so busy I haven't thought much about it.",
          "I'm still on the fence to be honest. What else can you tell me?",
          "I've been comparing options. What's your timeline like?",
          "I need a bit more time. Can we touch base next week?",
          "To be honest, I'm not sure this is the right time for us.",
          "I've had some other things come up that are taking priority.",
          "I spoke with a friend about it and they had some concerns.",
          "I'm worried about committing to something I haven't fully thought through.",
        ],
      },
      {
        tier: "hard",
        items: [
          "Look, I've decided not to go ahead. Thanks anyway.",
          "I've actually gone with someone else. Sorry.",
          "I'm not going to move forward. Please don't call again.",
          "We've decided to stay where we are. This isn't working for us.",
          "I'd rather not discuss it further. Thank you for your time.",
        ],
      },
    ],
    neutralOpeners: [
      "Hi, it's [rep] calling back like I promised last week. Do you have a moment?",
      "Hey, just following up on our conversation from last week.",
      "Hi there, checking in like we discussed. Got a minute?",
    ],
    positiveClosers: [
      "You know what, let's just book it in. I'm ready.",
      "Alright, you've convinced me. Let's do it.",
      "Sure, I'm on board now. What are the next steps?",
    ],
    shutdownLines: ["No, I've made my decision. Please respect that.", "I'm not interested anymore. Don't call again."],
  },
  {
    id: "property_sale",
    label: "Property Sale Discussion",
    icon: "house",
    goal: "Navigate a complex property sale conversation and reach agreement",
    description: "Discussing property sale specifics. Address concerns about valuation, timing, and process.",
    maxExchanges: 14,
    objectionTiers: [
      {
        tier: "soft",
        items: [
          "Okay, I'm open to hearing your thoughts on the property value.",
          "That makes sense. What would the timeline look like?",
          "I appreciate you walking me through the process.",
          "That's helpful. Can you tell me more about the market conditions?",
          "I'm following so far. What's the next thing I should know?",
          "Interesting perspective. How does that compare to recent sales?",
        ],
      },
      {
        tier: "moderate",
        items: [
          "The valuation seems a bit lower than I expected. Can you explain how you got that figure?",
          "I'm worried about the timing — we need to coordinate with buying our next place.",
          "What happens if the sale falls through? What's the backup plan?",
          "Are there any hidden fees or costs I should know about?",
          "I'm not comfortable with the proposed timeline. It feels rushed.",
          "Your commission seems high compared to what others have quoted.",
          "What if the market shifts while we're in the process?",
          "I need guarantees that this won't drag on for months.",
          "How many similar properties have you actually sold in this area?",
          "I want to understand exactly what happens at each stage before I sign anything.",
        ],
      },
      {
        tier: "hard",
        items: [
          "That valuation is way off. I've had two other appraisals that were much higher.",
          "I'm not comfortable with those terms. We need to renegotiate.",
          "This isn't working for us. We're going to explore other options.",
          "I think we're too far apart on price. I don't see how we bridge that gap.",
          "I'm pulling out. The risk is just too high for us.",
        ],
      },
    ],
    neutralOpeners: [
      "Thanks for taking the time to discuss your property. I'd love to learn more about it.",
      "Good to sit down with you. Let's talk through the details.",
      "I've done some preliminary research on your property. Shall we go through it?",
    ],
    positiveClosers: [
      "That all looks reasonable. Let's move forward with the agreement.",
      "I'm satisfied with the terms. What do I need to sign?",
      "You've addressed all my concerns. I'm ready to proceed.",
    ],
    shutdownLines: [
      "I'm walking away from this deal. Thank you for your time.",
      "We're not going to proceed. I've made my decision.",
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Conversation State Machine
// ─────────────────────────────────────────────────────────────────────────────

type ConversationPhase = "neutral" | "resisting" | "softening" | "closed";

interface ConversationState {
  phase: ConversationPhase;
  warmth: number; // 0-100, starts at 40
  objectionIndex: Record<"soft" | "moderate" | "hard", number>;
  lastUserScore: number; // quality of last user message (0-10)
  exchangesSinceObjection: number;
  hardShutdownTriggered: boolean;
}

function initState(): ConversationState {
  return {
    phase: "neutral",
    warmth: 40,
    objectionIndex: { soft: 0, moderate: 0, hard: 0 },
    lastUserScore: 5,
    exchangesSinceObjection: 0,
    hardShutdownTriggered: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Generation Engine
// ─────────────────────────────────────────────────────────────────────────────

function scoreUserMessage(text: string): number {
  const lower = text.toLowerCase();
  let score = 5; // baseline

  // Positive signals
  if (
    lower.includes("understand") ||
    lower.includes("appreciate") ||
    lower.includes("fair point") ||
    lower.includes("that makes sense")
  )
    score += 2;
  if (lower.includes("?")) score += 1; // asking questions is good
  if (
    lower.includes("how can i") ||
    lower.includes("what would") ||
    lower.includes("could we") ||
    lower.includes("would you")
  )
    score += 1;
  if (lower.length > 40) score += 1; // substantive response

  // Negative signals
  if (lower.includes("you must") || lower.includes("you need to") || lower.includes("you have to")) score -= 2;
  if (lower.includes("sorry") && lower.split("sorry").length > 2) score -= 1; // over-apologising
  if (lower.length < 15) score -= 1; // too brief
  if (lower.includes("just checking") || (lower.includes("quick question") && lower.length < 30)) score -= 1;

  return Math.max(0, Math.min(10, score));
}

function generateResponse(
  scenario: ScenarioDef,
  persona: Persona,
  difficulty: Difficulty,
  state: ConversationState,
  userMessage: string,
  exchangeCount: number,
): { response: string; newState: ConversationState } {
  const ns = { ...state };
  const userScore = scoreUserMessage(userMessage);
  const lower = userMessage.toLowerCase();

  ns.lastUserScore = userScore;
  ns.exchangesSinceObjection++;

  // Check for shutdown triggers (hard objections from user side)
  if (
    lower.includes("goodbye") ||
    lower.includes("hang up") ||
    lower.includes("waste of time") ||
    lower.includes("not worth")
  ) {
    ns.hardShutdownTriggered = true;
  }

  // If user is pushy, decrease warmth
  if (
    lower.includes("you must") ||
    lower.includes("you need to") ||
    lower.includes("right now") ||
    lower.includes("immediately")
  ) {
    ns.warmth = Math.max(0, ns.warmth - 20);
  }

  // If user acknowledges concerns, increase warmth
  if (
    lower.includes("understand") ||
    lower.includes("appreciate") ||
    lower.includes("i hear you") ||
    lower.includes("fair point") ||
    lower.includes("that's valid")
  ) {
    ns.warmth = Math.min(100, ns.warmth + 10);
  }

  // If user asks good questions, increase warmth
  if (
    (lower.includes("?") || lower.includes("what ") || lower.includes("how ") || lower.includes("why ")) &&
    userScore >= 7
  ) {
    ns.warmth = Math.min(100, ns.warmth + 5);
  }

  // Determine difficulty modifier
  const diffMod = difficulty === "easy" ? 15 : difficulty === "medium" ? 0 : -15;

  // Determine phase based on warmth
  if (ns.warmth + diffMod >= 70) ns.phase = "softening";
  else if (ns.warmth + diffMod >= 30) ns.phase = "neutral";
  else ns.phase = "resisting";

  // Determine if we should inject an objection (every 2-3 exchanges)
  const shouldInjectObjection = ns.exchangesSinceObjection >= (difficulty === "hard" ? 2 : 3);

  // Hard shutdown check
  if (ns.hardShutdownTriggered) {
    const pool = scenario.shutdownLines;
    return { response: pool[Math.floor(Math.random() * pool.length)], newState: { ...ns, phase: "closed" } };
  }

  // Positive closing check
  if (ns.phase === "softening" && ns.warmth >= 75 && exchangeCount >= scenario.maxExchanges * 0.7) {
    const pool = scenario.positiveClosers;
    return { response: pool[Math.floor(Math.random() * pool.length)], newState: { ...ns, phase: "closed" } };
  }

  // If objection should be injected
  if (shouldInjectObjection) {
    ns.exchangesSinceObjection = 0;

    // Choose tier based on warmth and difficulty
    let tier: "soft" | "moderate" | "hard";
    const adjustedWarmth = ns.warmth + diffMod;

    if (adjustedWarmth < 25 || difficulty === "hard") tier = "hard";
    else if (adjustedWarmth < 50 || difficulty === "medium") tier = "moderate";
    else tier = "soft";

    // Also factor in persona
    if (persona.id === "skeptical_professional" && tier === "soft") tier = "moderate";
    if (
      persona.id === "price_sensitive" &&
      !lower.includes("cost") &&
      !lower.includes("fee") &&
      !lower.includes("price")
    )
      tier = "moderate";
    if (persona.id === "time_poor_parent" && userMessage.length > 60) tier = "moderate"; // they get impatient with long messages

    const tierData = scenario.objectionTiers.find((t) => t.tier === tier)!;
    const idx = ns.objectionIndex[tier];
    const response = tierData.items[idx % tierData.items.length];
    ns.objectionIndex = { ...ns.objectionIndex, [tier]: idx + 1 };

    // Decrease warmth when objection is raised
    ns.warmth = Math.max(0, ns.warmth - (tier === "hard" ? 15 : tier === "moderate" ? 8 : 3));

    return { response, newState: ns };
  }

  // Neutral/conversational response based on phase
  if (ns.phase === "softening") {
    const warmResponses = [
      "Okay, that makes sense. Go on.",
      "I see your point. What else should I know?",
      "Alright, I'm following. What's the next step?",
      "That's actually helpful. Tell me more.",
      "Okay, you're making a good case.",
    ];
    return { response: warmResponses[Math.floor(Math.random() * warmResponses.length)], newState: ns };
  }

  if (ns.phase === "resisting") {
    const coldResponses = [
      "I'm not sure about this.",
      "I don't know if this is for me.",
      "I need more time to think.",
      "This doesn't feel right yet.",
      "I'm not convinced.",
    ];
    return { response: coldResponses[Math.floor(Math.random() * coldResponses.length)], newState: ns };
  }

  // Neutral phase — persona-flavoured neutral responses
  const neutralResponses = [
    "Okay, I'm listening.",
    "Go on then.",
    "Alright, what else?",
    "I see. And?",
    "Hmm, interesting.",
  ];

  // Add persona flavor
  if (persona.id === "time_poor_parent") {
    return { response: "Look, I've only got a minute. Get to the point.", newState: ns };
  }
  if (persona.id === "price_sensitive" && !lower.includes("cost") && !lower.includes("free")) {
    return { response: "Is there a cost involved in all this?", newState: ns };
  }
  if (persona.id === "skeptical_professional") {
    return { response: "I'll need to see evidence before I'm convinced.", newState: ns };
  }

  return { response: neutralResponses[Math.floor(Math.random() * neutralResponses.length)], newState: ns };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Analysis  (v2 — computed once, fed into both scoring + feedback)
// ─────────────────────────────────────────────────────────────────────────────

interface SessionAnalysis {
  questionsAsked: number;
  hesitations: number;
  ignoredObjections: number;
  closingAttemptExchange: number;
}

function analyzeSession(messages: ChatMessage[]): SessionAnalysis {
  const userMessages = messages.filter((m) => m.role === "user");
  const aiMessages = messages.filter((m) => m.role === "ai");

  // Questions asked by the rep
  const questionsAsked = userMessages.filter((m) => m.text.includes("?")).length;

  // Hesitations — very short replies are a confidence proxy
  const hesitations = userMessages.filter((m) => m.text.trim().length < 14).length;

  // Closing attempt — first exchange where user tried to book/close
  const closingWords = [
    "free",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "available",
    "lock in",
    "book",
    "set up",
    "schedule",
    "meet",
    "appointment",
    "morning",
    "afternoon",
    "works for you",
  ];
  let closingAttemptExchange = 0;
  userMessages.forEach((m, i) => {
    if (!closingAttemptExchange) {
      const lower = m.text.toLowerCase();
      if (closingWords.some((w) => lower.includes(w))) {
        closingAttemptExchange = i + 1;
      }
    }
  });

  // Ignored objections — AI objection the rep didn't acknowledge
  const objectionTriggers = [
    "not interested",
    "think about",
    "can't",
    "no thanks",
    "not sure",
    "worried",
    "not convinced",
    "too busy",
    "need more time",
    "doesn't feel right",
  ];
  const ackWords = ["understand", "appreciate", "hear you", "fair", "valid", "makes sense", "?"];
  let ignoredObjections = 0;
  aiMessages.forEach((aiMsg, i) => {
    const aiLower = aiMsg.text.toLowerCase();
    if (objectionTriggers.some((w) => aiLower.includes(w))) {
      const userReply = userMessages[i];
      if (userReply) {
        const repLower = userReply.text.toLowerCase();
        if (!ackWords.some((w) => repLower.includes(w))) {
          ignoredObjections++;
        }
      }
    }
  });

  return { questionsAsked, hesitations, ignoredObjections, closingAttemptExchange };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring Logic (Enhanced)
// ─────────────────────────────────────────────────────────────────────────────

function evaluateSession(messages: ChatMessage[], _scenario: ScenarioDef, state: ConversationState): SessionScore {
  const analysis = analyzeSession(messages);
  const userMessages = messages.filter((m) => m.role === "user");
  const aiMessages = messages.filter((m) => m.role === "ai");
  const totalExchanges = Math.min(userMessages.length, aiMessages.length);
  const fullText = userMessages.map((m) => m.text.toLowerCase()).join(" ");

  // Objection Handling (0-15): How well did user respond to pushback?
  let objectionHandling = 0;
  const aiText = aiMessages.map((m) => m.text.toLowerCase()).join(" ");
  const objectionKeywords = [
    "not interested",
    "think about",
    "cost",
    "how did",
    "busy",
    "different",
    "lower",
    "not convinced",
    "no thanks",
    "not sure",
    "need more time",
    "doesn't feel right",
    "not comfortable",
  ];
  const objectionsRaised = objectionKeywords.filter((k) => aiText.includes(k)).length;

  if (objectionsRaised > 0) {
    // Acknowledgment
    if (
      fullText.includes("understand") ||
      fullText.includes("appreciate") ||
      fullText.includes("hear you") ||
      fullText.includes("fair point") ||
      fullText.includes("valid")
    )
      objectionHandling += 4;
    // Reframing / redirecting
    if (
      fullText.includes("what if") ||
      fullText.includes("how about") ||
      fullText.includes("let me") ||
      fullText.includes("i can")
    )
      objectionHandling += 3;
    // Questioning back (good technique)
    const questionCount = (fullText.match(/\?/g) || []).length;
    if (questionCount >= 2) objectionHandling += 3;
    else if (questionCount >= 1) objectionHandling += 1;
    // Non-pushy tone
    if (!fullText.includes("you must") && !fullText.includes("you need to") && !fullText.includes("you have to"))
      objectionHandling += 2;
    // Sustained engagement
    if (totalExchanges >= 4) objectionHandling += 3;
    else if (totalExchanges >= 2) objectionHandling += 1;
  } else {
    // No objections raised — base score on engagement
    objectionHandling = Math.min(8, totalExchanges * 2);
  }

  // Questioning (0-15): Did the user ask good questions?
  let questioning = 0;
  const questions = userMessages.filter((m) => m.text.includes("?"));
  const questionRatio = userMessages.length > 0 ? questions.length / userMessages.length : 0;

  if (questionRatio >= 0.4) questioning += 5;
  else if (questionRatio >= 0.2) questioning += 3;
  else if (questionRatio > 0) questioning += 1;

  // Quality of questions
  if (
    fullText.includes("what happens if") ||
    fullText.includes("how does") ||
    fullText.includes("can you explain") ||
    fullText.includes("what's the process")
  )
    questioning += 4;
  if (
    fullText.includes("timeline") ||
    fullText.includes("cost") ||
    fullText.includes("next step") ||
    fullText.includes("what do you need")
  )
    questioning += 3;
  if (questions.length >= 3) questioning += 3;

  // Closing (0-10): Did the user attempt to close / move forward?
  let closing = 0;
  const closingSignals = [
    "book",
    "appointment",
    "meet",
    "next step",
    "move forward",
    "schedule",
    "set up",
    "let's",
    "shall we",
    "when can",
    "what day",
    "works for you",
  ];
  const closingCount = closingSignals.filter((s) => fullText.includes(s)).length;

  if (closingCount >= 2) closing += 4;
  else if (closingCount >= 1) closing += 2;

  // Clear call-to-action
  if (
    fullText.includes("are you free") ||
    fullText.includes("does that work") ||
    fullText.includes("would you like") ||
    fullText.includes("can we set")
  )
    closing += 3;

  // Persistence
  if (totalExchanges >= 5) closing += 3;
  else if (totalExchanges >= 3) closing += 1;

  // Final state bonus/penalty
  if (state.phase === "closed" && state.warmth >= 60) {
    objectionHandling = Math.min(15, objectionHandling + 2);
    closing = Math.min(10, closing + 2);
  }
  if (state.hardShutdownTriggered) {
    closing = Math.max(0, closing - 3);
  }

  // ── v2 analysis adjustments ───────────────────────────────────────────────
  // Hesitations signal low confidence — penalise questioning
  if (analysis.hesitations >= 3) questioning = Math.max(0, questioning - 3);
  else if (analysis.hesitations >= 2) questioning = Math.max(0, questioning - 1);

  // Ignored objections — penalise objection handling
  if (analysis.ignoredObjections >= 2)
    objectionHandling = Math.max(0, objectionHandling - analysis.ignoredObjections * 2);
  else if (analysis.ignoredObjections === 1) objectionHandling = Math.max(0, objectionHandling - 1);

  // Early close attempt (≤ exchange 3) is a bonus
  if (analysis.closingAttemptExchange > 0 && analysis.closingAttemptExchange <= 3) {
    closing = Math.min(10, closing + 1);
  }

  return {
    objectionHandling: Math.min(15, Math.max(0, objectionHandling)),
    questioning: Math.min(15, Math.max(0, questioning)),
    closing: Math.min(10, Math.max(0, closing)),
    total: 0,
    questionsAsked: analysis.questionsAsked,
    hesitations: analysis.hesitations,
    ignoredObjections: analysis.ignoredObjections,
    closingAttemptExchange: analysis.closingAttemptExchange,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Scores (v3 — granular per-phase scoring)
// ─────────────────────────────────────────────────────────────────────────────

function computeSectionScores(messages: ChatMessage[]): SectionScores {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) return { opening: 0, rapport: 0, qualification: 0, valueDelivery: 0, closing: 0 };

  const fullText = userMessages.map((m) => m.text.toLowerCase()).join(" ");
  const first2Text = userMessages
    .slice(0, 2)
    .map((m) => m.text.toLowerCase())
    .join(" ");
  const questionCount = (fullText.match(/\?/g) ?? []).length;

  // Opening (0–10): clear intro + stated purpose in first 2 exchanges
  let opening = 2;
  if (first2Text.includes("asg") || first2Text.includes("i'm") || first2Text.includes("my name")) opening += 2;
  if (
    first2Text.includes("calling") ||
    first2Text.includes("reach") ||
    first2Text.includes("here") ||
    first2Text.includes("reason")
  )
    opening += 2;
  if (first2Text.length > 60) opening += 2;
  if (first2Text.includes("?")) opening += 2;

  // Rapport (0–10): empathy, active listening, engagement
  let rapport = 2;
  const rapportWords = [
    "understand",
    "appreciate",
    "hear you",
    "i can see",
    "makes sense",
    "tell me",
    "how are",
    "how long",
    "what's been",
  ];
  rapport += rapportWords.filter((w) => fullText.includes(w)).length;
  if (questionCount >= 3) rapport += 3;
  else if (questionCount >= 1) rapport += 1;

  // Qualification (0–10): asked qualifying questions about property / situation
  let qualification = 2;
  const qualWords = [
    "own",
    "mortgage",
    "property",
    "current",
    "how long",
    "when did",
    "do you",
    "are you",
    "situation",
    "currently",
  ];
  qualification += qualWords.filter((w) => fullText.includes(w)).length;

  // Value Delivery (0–10): explained specific benefit or result
  let valueDelivery = 2;
  const valueWords = [
    "benefit",
    "help",
    "save",
    "improve",
    "result",
    "specialise",
    "what we do",
    "families",
    "clients",
    "average",
    "typically",
    "reduce",
    "lower",
  ];
  valueDelivery += valueWords.filter((w) => fullText.includes(w)).length;

  // Closing (0–10): specific time offer + commitment ask
  let closing = 1;
  const closingWords = [
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "morning",
    "afternoon",
    "free",
    "available",
    "lock in",
    "book",
    "schedule",
    "meet",
    "next step",
    "move forward",
    "are you free",
  ];
  closing += closingWords.filter((w) => fullText.includes(w)).length;
  if (userMessages.length >= 4) closing += 2;

  return {
    opening: Math.min(10, opening),
    rapport: Math.min(10, rapport),
    qualification: Math.min(10, qualification),
    valueDelivery: Math.min(10, valueDelivery),
    closing: Math.min(10, closing),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured Feedback (v3 — strengths / improvements / missed)
// ─────────────────────────────────────────────────────────────────────────────

function generateStructuredFeedback(
  score: SessionScore,
  messages: ChatMessage[],
  persona: Persona,
): StructuredFeedback {
  const strengths: string[] = [];
  const improvements: string[] = [];
  const missedOpportunities: string[] = [];

  const userMessages = messages.filter((m) => m.role === "user");
  const fullText = userMessages.map((m) => m.text.toLowerCase()).join(" ");

  // ── Strengths ──────────────────────────────────────────────────────────────
  if (score.objectionHandling >= 11)
    strengths.push("Handled objections confidently — acknowledged, reframed, and redirected effectively.");
  if (score.questioning >= 11)
    strengths.push("Strong discovery questioning — kept the conversation moving with well-timed, relevant questions.");
  if (score.closing >= 7) strengths.push("Effective close — pushed for a specific next step and created commitment.");
  if ((score.questionsAsked ?? 0) >= 4)
    strengths.push(`Asked ${score.questionsAsked} questions throughout — excellent curiosity and discovery technique.`);
  if ((score.hesitations ?? 0) === 0) strengths.push("Confident, full responses throughout — no hesitation detected.");
  if (score.closingAttemptExchange && score.closingAttemptExchange <= 3)
    strengths.push(`Early closing attempt at exchange ${score.closingAttemptExchange} — good assertiveness.`);
  if (fullText.includes("understand") || fullText.includes("appreciate") || fullText.includes("hear you"))
    strengths.push("Used empathy language — builds trust and keeps the prospect engaged.");

  // ── Improvements ───────────────────────────────────────────────────────────
  if (score.objectionHandling < 8)
    improvements.push(
      'Work on objection handling — always acknowledge the concern before reframing. Try: "I completely understand that…"',
    );
  if (score.questioning < 8)
    improvements.push("Ask more open-ended questions — aim for at least one question every two exchanges.");
  if (score.closing < 5)
    improvements.push(
      "Practise closing more confidently — offer two specific time options rather than vague next steps.",
    );
  if ((score.hesitations ?? 0) >= 2)
    improvements.push(`${score.hesitations} very short responses detected — commit to fuller, more confident answers.`);
  if (userMessages.length < 3)
    improvements.push("Session was too brief — engage longer to build rapport and qualify properly.");

  // ── Missed Opportunities ───────────────────────────────────────────────────
  if ((score.ignoredObjections ?? 0) >= 1)
    missedOpportunities.push(
      `${score.ignoredObjections} objection${(score.ignoredObjections ?? 0) > 1 ? "s" : ""} bypassed without acknowledgment — always validate the prospect's concern first.`,
    );
  if (!score.closingAttemptExchange || score.closingAttemptExchange === 0)
    missedOpportunities.push(
      "No closing attempt was made — every session should end with a specific ask for commitment.",
    );
  if ((score.questionsAsked ?? 0) === 0 && userMessages.length > 2)
    missedOpportunities.push(
      "No questions asked — missed key opportunities to qualify and understand the prospect's situation.",
    );
  if (
    !fullText.includes("understand") &&
    !fullText.includes("appreciate") &&
    !fullText.includes("hear") &&
    userMessages.length > 2
  )
    missedOpportunities.push(
      'No empathy language used — phrases like "I understand that" or "I can appreciate that" significantly increase trust.',
    );

  // Persona-specific miss
  if (
    persona.id === "price_sensitive" &&
    !fullText.includes("cost") &&
    !fullText.includes("fee") &&
    !fullText.includes("free")
  )
    missedOpportunities.push(
      `${persona.label} cares deeply about cost — you didn't address pricing, which left a key concern unresolved.`,
    );
  if (persona.id === "time_poor_parent" && userMessages.some((m) => m.text.length > 80))
    missedOpportunities.push(`${persona.label} is time-poor — some responses were too long. Get to the point faster.`);

  return { strengths, improvements, missedOpportunities };
}

function getFeedback(score: SessionScore, persona: Persona): string {
  const parts: string[] = [];

  // ── Objection Handling ─────────────────────────────────────────────────────
  if (score.objectionHandling >= 12)
    parts.push(
      "✅ Excellent objection handling — you acknowledged concerns, reframed effectively, and stayed composed under pressure.",
    );
  else if (score.objectionHandling >= 8)
    parts.push(
      "⚠️ Good objection handling. You acknowledged some concerns but could reframe more confidently. Practise the Acknowledge → Reframe → Redirect pattern.",
    );
  else
    parts.push(
      '❌ Objection handling needs work. Don\'t argue or dismiss — acknowledge their concern, reframe it positively, then redirect with a question. Try: "I completely understand that — a lot of our clients felt the same way. What changed for them was…"',
    );

  // Ignored objections highlight
  if (score.ignoredObjections >= 2)
    parts.push(
      `💡 Missed opportunity: You bypassed ${score.ignoredObjections} objections without acknowledging them. Every objection is a chance to build trust — always validate first.`,
    );

  // ── Questioning ────────────────────────────────────────────────────────────
  if (score.questioning >= 12)
    parts.push("✅ Strong questioning — you asked relevant, open-ended questions that moved the conversation forward.");
  else if (score.questioning >= 8)
    parts.push(
      "⚠️ Decent questioning but could be more strategic. Ask about timeline, concerns, and their decision-making process.",
    );
  else
    parts.push(
      "❌ You didn't ask enough questions. Great salespeople listen more than they talk. Target: at least one question every 2 exchanges.",
    );

  const qAsked = score.questionsAsked ?? 0;
  if (qAsked === 0) parts.push("💡 You asked zero questions this session. Start every response with curiosity.");
  else if (qAsked >= 5) parts.push(`✅ Great job asking ${qAsked} questions — strong discovery technique.`);

  // Hesitation feedback
  const hes = score.hesitations ?? 0;
  if (hes >= 3)
    parts.push(
      "💡 Several very short responses detected — this can signal hesitation. Slow down, breathe, and commit to a full sentence before speaking.",
    );

  // ── Closing ────────────────────────────────────────────────────────────────
  if (score.closing >= 8)
    parts.push("✅ Strong closing — you pushed for a clear next step and moved the conversation toward commitment.");
  else if (score.closing >= 5)
    parts.push(
      "⚠️ Moderate closing attempt. Be more direct — offer two specific time options and assume the appointment.",
    );
  else
    parts.push(
      '❌ You didn\'t attempt to close. Always end with a clear call to action. "Are you free Tuesday or Wednesday?" beats "I\'ll let you think about it."',
    );

  const ca = score.closingAttemptExchange ?? 0;
  if (ca === 0 && score.closing < 5)
    parts.push(
      "💡 Missed opportunity: No closing attempt was made. In real sales, every session should end with a specific ask.",
    );
  else if (ca > 0 && ca <= 3)
    parts.push(`✅ Good timing — you attempted to close at exchange ${ca} (early close is a positive signal).`);

  // ── Persona coaching ───────────────────────────────────────────────────────
  parts.push(
    `\n📋 Persona note: ${persona.label} — ${persona.demeanor}.\nThey soften when ${persona.softensWhen} and harden when ${persona.hardensWhen}.`,
  );

  return parts.join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup Panel
// ─────────────────────────────────────────────────────────────────────────────

function SetupPanel({
  onStart,
  hardUnlocked,
}: {
  onStart: (scenario: ScenarioType, difficulty: Difficulty, persona: PersonaType, scriptId?: string) => void;
  hardUnlocked?: boolean;
}) {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType>("booking_call");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>("skeptical_professional");
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [showScriptPreview, setShowScriptPreview] = useState(false);

  const { getScriptsForCategory } = useScripts();
  const scriptsForScenario = getScriptsForCategory(selectedScenario);
  const selectedScript = scriptsForScenario.find((s) => s.id === selectedScriptId) ?? null;

  // Reset script selection if scenario changes and the script no longer applies
  const handleScenarioChange = (id: ScenarioType) => {
    setSelectedScenario(id);
    setSelectedScriptId("");
    setShowScriptPreview(false);
  };

  const scenario = SCENARIOS.find((s) => s.id === selectedScenario)!;
  const persona = PERSONAS[selectedPersona];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare size={20} className="text-purple-500" /> AI Role-Play Training
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Practice real-world scenarios with realistic client personas
        </p>
      </div>

      {/* Scenario Selection */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Target size={14} /> Choose Scenario
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleScenarioChange(s.id)}
              className={`p-3 rounded-lg border text-left transition min-h-[44px] ${
                selectedScenario === s.id
                  ? "border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-400/30"
                  : "border-gray-200 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
              }`}
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{s.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{s.goal}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Persona Selection */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <User size={14} /> Choose Persona
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.values(PERSONAS).map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPersona(p.id)}
              className={`p-3 rounded-lg border text-left transition min-h-[44px] ${
                selectedPersona === p.id
                  ? "border-purple-400 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-400/30"
                  : "border-gray-200 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{p.emoji}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{p.label}</span>
              </div>
              <div className="text-[10px] text-gray-400 line-clamp-1">{p.demeanor}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Star size={14} /> Difficulty
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`py-2.5 rounded-lg border text-sm font-medium transition min-h-[44px] ${
                difficulty === d
                  ? d === "easy"
                    ? "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                    : d === "medium"
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                      : "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                  : "border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Scenario + Persona Details */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Session Details</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{scenario.description}</p>
        <div className="bg-gray-50 dark:bg-slate-900/40 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-base">{persona.emoji}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{persona.label}</span>
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">{persona.demeanor}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">
            <strong>Concerns:</strong> {persona.primaryConcerns.join(", ")}
          </div>
          <div className="text-[10px] text-green-600 dark:text-green-400">✓ Softens when: {persona.softensWhen}</div>
          <div className="text-[10px] text-red-600 dark:text-red-400">✗ Hardens when: {persona.hardensWhen}</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-3">
          <Clock size={12} />
          <span>Up to {scenario.maxExchanges} exchanges</span>
        </div>
      </div>

      {/* Hard mode lock hint */}
      {difficulty === "hard" && !hardUnlocked && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-700 dark:text-amber-400">
          <Zap size={13} className="flex-shrink-0" />
          Hard mode unlocks after 5 completed sessions or an average score of 28+. Complete a few practice sessions
          first!
        </div>
      )}

      {/* Script Guide Selection */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <BookOpen size={14} /> Script Guide{" "}
          <span className="text-[11px] font-normal text-gray-400 dark:text-gray-500">(optional)</span>
        </h3>

        {/* Script dropdown */}
        <select
          value={selectedScriptId}
          onChange={(e) => {
            setSelectedScriptId(e.target.value);
            setShowScriptPreview(false);
          }}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400 mb-3 min-h-[44px]"
        >
          <option value="">No script — free practice</option>
          {scriptsForScenario.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>

        {/* Script summary + preview */}
        {selectedScript && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">{selectedScript.summary}</p>
            <button
              onClick={() => setShowScriptPreview(!showScriptPreview)}
              className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
            >
              {showScriptPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showScriptPreview ? "Hide preview" : "Preview script"}
            </button>
            {showScriptPreview && (
              <div className="mt-2 space-y-2">
                {selectedScript.sections.map((sec, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30"
                  >
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">{sec.label}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sec.guidance}</p>
                      {sec.keyPhrases && sec.keyPhrases.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {sec.keyPhrases.map((kp, ki) => (
                            <p key={ki} className="text-[10px] text-purple-500 dark:text-purple-400 italic">
                              "{kp}"
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Start Button */}
      <button
        onClick={() => onStart(selectedScenario, difficulty, selectedPersona, selectedScriptId || undefined)}
        disabled={difficulty === "hard" && !hardUnlocked}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-500 text-white font-semibold text-sm hover:bg-purple-400 transition min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Play size={16} /> Start Role-Play
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Interface
// ─────────────────────────────────────────────────────────────────────────────

function ChatInterface({
  scenario,
  persona,
  difficulty,
  messages,
  onSend,
  onEnd,
  loading,
  voiceMode,
  onToggleVoiceMode,
  voiceSupported,
  voiceModeEnabled,
  sttStatus,
  sttTranscript,
  sttError,
  onMicClick,
  isSpeaking,
  onStopSpeech,
  currentScript,
  naturalMode = false,
  onToggleNaturalMode,
  naturalStatus = "idle",
}: {
  scenario: ScenarioDef;
  persona: Persona;
  difficulty: Difficulty;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onEnd: () => void;
  loading: boolean;
  voiceMode: boolean;
  onToggleVoiceMode: () => void;
  voiceSupported: boolean;
  voiceModeEnabled: boolean;
  sttStatus: STTStatus;
  sttTranscript: string;
  sttError: string | null;
  onMicClick: () => void;
  isSpeaking: boolean;
  onStopSpeech: () => void;
  currentScript?: TrainingScript | null;
  naturalMode?: boolean;
  onToggleNaturalMode?: () => void;
  naturalStatus?: "idle" | "listening" | "processing";
}) {
  const [input, setInput] = useState("");
  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const exchangeCount = Math.min(
    messages.filter((m) => m.role === "user").length,
    messages.filter((m) => m.role === "ai").length,
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const difficultyColor =
    difficulty === "easy"
      ? "text-green-600 dark:text-green-400"
      : difficulty === "medium"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center justify-between flex-shrink-0 gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{scenario.label}</h3>
            <span className={`text-[10px] font-semibold uppercase flex-shrink-0 ${difficultyColor}`}>{difficulty}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-0.5">
            <span className="flex items-center gap-1">
              {persona.emoji} {persona.label}
            </span>
            <span className="flex items-center gap-1 hidden sm:flex">
              <Target size={10} />
              {scenario.goal}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={10} />
              {exchangeCount}/{scenario.maxExchanges}
            </span>
          </div>
        </div>

        {/* Chat / Voice toggle */}
        {/* Chat / Voice toggle — hidden when voice mode feature flag is off */}
        {voiceSupported !== undefined && (
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-shrink-0">
            <button
              onClick={() => voiceMode && onToggleVoiceMode()}
              title="Chat mode"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition min-h-[32px] ${
                !voiceMode
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <MessageSquare size={11} />
              <span className="hidden xs:inline">Chat</span>
            </button>
            {voiceModeEnabled && (
              <button
                onClick={() => !voiceMode && onToggleVoiceMode()}
                title={voiceSupported ? "Voice mode" : "Voice requires Chrome or Edge"}
                disabled={!voiceSupported}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition min-h-[32px] disabled:opacity-40 disabled:cursor-not-allowed ${
                  voiceMode
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <Mic size={11} />
                <span className="hidden xs:inline">Voice</span>
              </button>
            )}
          </div>
        )}

        {/* Script guide button — only shown when a script is active */}
        {currentScript && (
          <button
            onClick={() => setShowScriptGuide(!showScriptGuide)}
            title="Toggle script guide"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition min-h-[36px] flex-shrink-0 ${
              showScriptGuide
                ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                : "border-gray-300 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
            }`}
          >
            <BookOpen size={12} />
            <span className="hidden sm:inline">Script</span>
          </button>
        )}

        <button
          onClick={onEnd}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition min-h-[36px] flex-shrink-0"
        >
          <XCircle size={12} /> End
        </button>
      </div>

      {/* Script guide panel — collapsible, shown below header */}
      {currentScript && showScriptGuide && (
        <div className="border-b border-purple-200 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-900/10 px-4 py-3 overflow-y-auto max-h-48 flex-shrink-0">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1.5">
            <BookOpen size={11} /> {currentScript.title}
          </p>
          <div className="flex flex-col gap-1.5">
            {currentScript.sections.map((sec, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-purple-500 text-white text-[9px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <span className="font-semibold text-purple-700 dark:text-purple-300">{sec.label}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">— {sec.guidance.split(".")[0]}.</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* "Start speaking" prompt — shown when no messages yet */}
        {messages.filter((m) => m.role !== "system").length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Mic size={28} className="text-purple-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
                {voiceMode ? "Start speaking to begin" : "Type your opening line"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {naturalMode
                  ? "Natural Mode is on — just speak naturally. The AI will respond after a pause."
                  : voiceMode
                    ? "Tap the mic button below, then speak when ready."
                    : `You're talking to ${persona.emoji} ${persona.label}. Make your opening move.`}
              </p>
            </div>
          </div>
        )}
        {messages
          .filter((m) => m.role !== "system")
          .map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-purple-500 text-white rounded-br-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2">
              <Loader size={14} className="animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — Chat mode */}
      {!voiceMode && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-white/[0.06] flex items-center gap-2 flex-shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response..."
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400 min-h-[44px]"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-lg bg-purple-500 text-white hover:bg-purple-400 disabled:opacity-50 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {loading ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      )}

      {/* Input — Voice mode */}
      {voiceMode && (
        <div className="px-4 py-4 border-t border-gray-100 dark:border-white/[0.06] flex flex-col items-center gap-3 flex-shrink-0">
          {/* Natural Mode toggle */}
          {voiceModeEnabled && onToggleNaturalMode && (
            <button
              onClick={onToggleNaturalMode}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition ${
                naturalMode
                  ? "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                  : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400"
              }`}
            >
              <span className="flex items-center gap-2">
                <Mic size={12} />
                Natural Mode {naturalMode ? "ON" : "OFF"}
              </span>
              <span className="text-[10px] opacity-70">
                {naturalMode ? "Listening continuously — speak naturally" : "Tap to enable hands-free mode"}
              </span>
            </button>
          )}

          {/* Live transcript bubble */}
          {sttTranscript && (sttStatus === "listening" || naturalStatus === "listening") && (
            <div className="w-full px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm text-purple-700 dark:text-purple-300 text-center italic">
              "{sttTranscript}"
            </div>
          )}

          {/* Error message — with fallback to chat suggestion */}
          {sttError && (
            <div className="w-full space-y-1.5">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                <AlertCircle size={12} className="flex-shrink-0" />
                {sttError}
              </div>
              <p className="text-xs text-center text-gray-400">
                Switch to{" "}
                <button onClick={onStopSpeech} className="underline text-purple-500">
                  Chat mode
                </button>{" "}
                to continue without a microphone.
              </p>
            </div>
          )}

          {/* AI speaking indicator */}
          {isSpeaking && (
            <button
              onClick={onStopSpeech}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition animate-pulse"
            >
              <VolumeX size={12} /> AI speaking — tap to stop
            </button>
          )}

          {/* Natural Mode status indicator */}
          {naturalMode && !isSpeaking && (
            <div
              className={`flex items-center gap-2 text-xs font-medium ${
                naturalStatus === "listening"
                  ? "text-green-600 dark:text-green-400"
                  : naturalStatus === "processing"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-400"
              }`}
            >
              {naturalStatus === "listening" && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
              )}
              {naturalStatus === "listening"
                ? "Listening…"
                : naturalStatus === "processing"
                  ? "Processing…"
                  : "Ready — start speaking"}
            </div>
          )}

          {/* Mic button — hidden in Natural Mode */}
          {!naturalMode && (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onMicClick}
                disabled={loading || sttStatus === "processing" || isSpeaking}
                aria-label={sttStatus === "listening" ? "Stop recording" : "Start recording"}
                className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg focus:outline-none focus:ring-4 ${
                  sttStatus === "listening"
                    ? "bg-red-500 text-white shadow-red-300/60 dark:shadow-red-900/60 focus:ring-red-300/40"
                    : "bg-purple-500 text-white hover:bg-purple-400 shadow-purple-300/40 dark:shadow-purple-900/40 focus:ring-purple-300/40 disabled:opacity-50 disabled:cursor-not-allowed"
                }`}
              >
                {/* Pulsing rings when listening */}
                {sttStatus === "listening" && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-25" />
                    <span
                      className="absolute inset-0 rounded-full bg-red-300 animate-ping opacity-15"
                      style={{ animationDelay: "0.3s" }}
                    />
                  </>
                )}
                {sttStatus === "listening" ? <MicOff size={24} /> : <Mic size={24} />}
              </button>

              {/* Status label */}
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center select-none">
                {sttStatus === "listening"
                  ? "Listening… tap to stop"
                  : sttStatus === "processing"
                    ? "Processing…"
                    : loading
                      ? "AI is thinking…"
                      : isSpeaking
                        ? "AI is speaking…"
                        : "Tap mic to speak"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Screen
// ─────────────────────────────────────────────────────────────────────────────

function ResultsScreen({
  score,
  feedback,
  sessionAnalysis,
  scenario,
  difficulty,
  persona,
  onRetry,
  onBack,
}: {
  score: SessionScore;
  feedback: string;
  sessionAnalysis: SessionFeedback | null;
  scenario: ScenarioDef;
  difficulty: Difficulty;
  persona: Persona;
  onRetry: () => void;
  onBack: () => void;
}) {
  const metrics = [
    {
      label: "Objection Handling",
      value: score.objectionHandling,
      max: 15,
      icon: <Shield size={14} />,
      color: "amber",
    },
    { label: "Questioning", value: score.questioning, max: 15, icon: <MessageSquare size={14} />, color: "blue" },
    { label: "Closing", value: score.closing, max: 10, icon: <CheckCircle size={14} />, color: "green" },
  ];

  const totalPct = (score.total / 40) * 100;
  const grade = totalPct >= 80 ? "A" : totalPct >= 60 ? "B" : totalPct >= 40 ? "C" : "D";
  const gradeColor =
    totalPct >= 80
      ? "text-green-600 dark:text-green-400"
      : totalPct >= 60
        ? "text-amber-600 dark:text-amber-400"
        : totalPct >= 40
          ? "text-orange-600 dark:text-orange-400"
          : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className={`text-5xl font-black ${gradeColor} mb-1`}>{grade}</div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{score.total}/40</div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {scenario.label} · {difficulty} · {persona.label}
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Score Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`text-${m.color}-500`}>{m.icon}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{m.label}</span>
                </div>
                <span className="font-bold tabular-nums text-gray-900 dark:text-white">
                  {m.value}/{m.max}
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    m.value / m.max >= 0.8 ? "bg-green-500" : m.value / m.max >= 0.5 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${(m.value / m.max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feedback */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
          <AlertCircle size={14} className="text-amber-500" /> Feedback
        </h3>
        <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">{feedback}</div>
      </div>

      {/* AI Coaching Analysis */}
      {sessionAnalysis && (
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 space-y-4">
          {/* Overall score */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Zap size={14} className="text-[#b8933a]" /> AI Coaching Analysis
            </h3>
            <span
              className={`text-lg font-bold ${
                sessionAnalysis.overallScore >= 70
                  ? "text-green-600"
                  : sessionAnalysis.overallScore >= 40
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {sessionAnalysis.overallScore}%
            </span>
          </div>

          {/* Strengths */}
          {sessionAnalysis.strengths.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1">
                <CheckCircle size={12} /> Strengths
              </h4>
              <ul className="space-y-1">
                {sessionAnalysis.strengths.map((s, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                    <ChevronRight size={12} className="text-green-500 mt-0.5 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weaknesses */}
          {sessionAnalysis.weaknesses.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> Areas to Improve
              </h4>
              <ul className="space-y-1">
                {sessionAnalysis.weaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                    <ChevronRight size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missed Opportunities */}
          {sessionAnalysis.missedOpportunities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1">
                <XCircle size={12} /> Missed Opportunities
              </h4>
              <ul className="space-y-1">
                {sessionAnalysis.missedOpportunities.map((m, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                    <ChevronRight size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-300 dark:border-white/[0.08] text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition min-h-[44px]"
        >
          <ChevronLeft size={16} /> Back to Scenarios
        </button>
        <button
          onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-semibold hover:bg-purple-400 transition min-h-[44px]"
        >
          <RotateCcw size={16} /> Retry
        </button>
      </div>
    </div>
  );
}

// Shield icon
function Shield({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function AIRoleplayPage() {
  const { currentUser } = useAppStore();
  const [sessionState, setSessionState] = useState<SessionState>("setup");
  const [scenario, setScenario] = useState<ScenarioDef | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<SessionScore | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sessionAnalysis, setSessionAnalysis] = useState<SessionFeedback | null>(null);
  const [convState, setConvState] = useState<ConversationState>(initState());

  // ── Global settings (real-time from Firestore) ─────────────────────────────
  const { config: appConfig } = useAppSettings();
  const aiSettings = appConfig.aiSettings;
  const featureFlags = appConfig.featureFlags;

  // ── Script state ───────────────────────────────────────────────────────────
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  const { getScriptById } = useScripts();
  const currentScript = currentScriptId ? getScriptById(currentScriptId) : null;

  // ── Session timing ─────────────────────────────────────────────────────────
  const sessionStartRef = useRef<number>(0);

  // ── Partial save on unmount ────────────────────────────────────────────────
  // Snapshot of live session data accessible from the cleanup function
  interface LiveSnapshot {
    messages: ChatMessage[];
    convState: ConversationState;
    scenario: ScenarioDef | null;
    persona: Persona | null;
    difficulty: Difficulty;
    sessionState: SessionState;
    currentScriptId: string | null;
    currentUserId: number | null;
    currentUserName: string;
  }
  const liveSnapshotRef = useRef<LiveSnapshot>({
    messages: [],
    convState: initState(),
    scenario: null,
    persona: null,
    difficulty: "medium",
    sessionState: "setup",
    currentScriptId: null,
    currentUserId: null,
    currentUserName: "",
  });

  // ── Voice state ────────────────────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState(false);
  const [naturalMode, setNaturalMode] = useState(false); // continuous listening mode
  const naturalModeRef = useRef(false);
  useEffect(() => {
    naturalModeRef.current = naturalMode;
  }, [naturalMode]);

  // ── Natural Mode — continuous recognition engine ──────────────────────────
  // Guarantees:
  //  - Only ONE SpeechRecognition instance alive at any time
  //  - No auto-restart loops — onend cleans up; restart only triggered explicitly
  //  - accumulatedFinal is reset on each start, preventing duplicate accumulation
  //  - Only FINAL transcripts are forwarded to handleSend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naturalRecRef = useRef<any>(null);
  const naturalActiveRef = useRef(false);
  const naturalSilenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [naturalStatus, setNaturalStatus] = useState<"idle" | "listening" | "processing">("idle");
  const [naturalTranscript, setNaturalTranscript] = useState("");

  /** Destroy the current natural recognition instance cleanly */
  const destroyNatural = useCallback(() => {
    if (naturalSilenceRef.current) {
      clearTimeout(naturalSilenceRef.current);
      naturalSilenceRef.current = null;
    }
    if (naturalRecRef.current) {
      // Remove handlers to prevent stale callbacks
      naturalRecRef.current.onresult = null;
      naturalRecRef.current.onend = null;
      naturalRecRef.current.onerror = null;
      naturalRecRef.current.onstart = null;
      try {
        naturalRecRef.current.stop();
      } catch {
        /* already stopped */
      }
      naturalRecRef.current = null;
    }
  }, []);

  const stopNatural = useCallback(() => {
    naturalActiveRef.current = false;
    setNaturalStatus("idle");
    setNaturalTranscript("");
    destroyNatural();
  }, [destroyNatural]);

  const startNatural = useCallback(() => {
    if (!naturalModeRef.current) return;
    // If an instance already exists, destroy it first — never allow duplicates
    if (naturalRecRef.current) {
      destroyNatural();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const API = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!API) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new API();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-AU";
    rec.maxAlternatives = 1;
    naturalRecRef.current = rec;

    // Reset accumulation — fresh start each time
    let accumulatedFinal = "";

    const resetSilence = () => {
      if (naturalSilenceRef.current) clearTimeout(naturalSilenceRef.current);
      naturalSilenceRef.current = setTimeout(() => {
        // Silence detected — fire the accumulated final text
        if (accumulatedFinal.trim().length > 2) {
          const textToSend = accumulatedFinal.trim();
          accumulatedFinal = ""; // clear before processing
          setNaturalStatus("processing");
          setNaturalTranscript("");
          destroyNatural();
          handleSendRef.current(textToSend);
        }
      }, 1800); // 1.8s silence = end of utterance
    };

    rec.onstart = () => {
      setNaturalStatus("listening");
      accumulatedFinal = ""; // fresh reset on every start
      resetSilence();
    };

    // Only process FINAL transcripts for sending; interim for display only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let interim = "";
      let newFinal = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          newFinal += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }

      if (newFinal) {
        accumulatedFinal += newFinal + " ";
      }

      const displayed = (accumulatedFinal + interim).trim();
      setNaturalTranscript(displayed);

      if (displayed.length > 2) {
        resetSilence();
      }
    };

    rec.onerror = () => {
      naturalActiveRef.current = false;
      destroyNatural();
      setNaturalStatus("idle");
    };

    rec.onend = () => {
      // NO auto-restart here — restart is only triggered explicitly
      // (via the TTS isSpeaking effect or manual enable)
      destroyNatural();
      setNaturalStatus((prev) => (prev === "processing" ? prev : "idle"));
    };

    try {
      rec.start();
    } catch {
      destroyNatural();
    }

  }, [destroyNatural]);

  // Auto-restart natural listening after AI finishes speaking
  const prevIsSpeakingRef = useRef(false);

  // Refs for stable access inside async callbacks/timeouts without stale closures
  const voiceModeRef = useRef(voiceMode);
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // TTS hook — speak AI responses aloud
  const tts = useTextToSpeech();
  const speakRef = useRef(tts.speak);
  const stopSpeechRef = useRef(tts.stop);
  useEffect(() => {
    speakRef.current = tts.speak;
  }, [tts.speak]);
  useEffect(() => {
    stopSpeechRef.current = tts.stop;
  }, [tts.stop]);

  // After AI finishes speaking in Natural Mode → auto-restart listening
  useEffect(() => {
    if (prevIsSpeakingRef.current && !tts.isSpeaking && naturalModeRef.current && naturalActiveRef.current) {
      setTimeout(() => startNatural(), 400);
    }
    prevIsSpeakingRef.current = tts.isSpeaking;
  }, [tts.isSpeaking, startNatural]);

  // STT hook — forward result directly into handleSend (via ref to avoid stale closure)
  const handleSendRef = useRef<(text: string) => void>(() => {});
  const stt = useSpeechToText(
    useCallback((text: string) => {
      handleSendRef.current(text);
    }, []),
  );

  // ── Keep live snapshot in sync for unmount cleanup ────────────────────────
  useEffect(() => {
    liveSnapshotRef.current = {
      messages,
      convState,
      scenario,
      persona,
      difficulty,
      sessionState,
      currentScriptId,
      currentUserId: currentUser?.id ?? null,
      currentUserName: currentUser?.name ?? "",
    };
  }); // runs after every render — no deps array intentional

  // ── Partial save on unmount (early exit guard) ────────────────────────────
  useEffect(() => {
    return () => {
      const snap = liveSnapshotRef.current;
      // Only save if session was active and the rep had at least 1 exchange
      if (snap.sessionState !== "active" || !snap.scenario || !snap.persona || !snap.currentUserId) return;

      const userMsgs = snap.messages.filter((m) => m.role === "user");
      if (userMsgs.length === 0) return; // empty session — nothing to save

      const endedAt = Date.now();
      const durationSeconds = sessionStartRef.current ? Math.round((endedAt - sessionStartRef.current) / 1000) : 0;

      const repChars = userMsgs.reduce((s, m) => s + m.text.length, 0);
      const aiChars = snap.messages.filter((m) => m.role === "ai").reduce((s, m) => s + m.text.length, 0);
      const totalChars = repChars + aiChars || 1;

      // Fire-and-forget — don't await (cleanup can't be async)
      addDoc(collection(db, "trainingSessions"), {
        repId: snap.currentUserId,
        repName: snap.currentUserName,
        userId: String(snap.currentUserId),
        userName: snap.currentUserName,
        scenarioType: snap.scenario.id,
        scriptType: snap.scenario.id,
        difficulty: snap.difficulty,
        personaType: snap.persona.id,
        messages: snap.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            sender: m.role === "user" ? "rep" : "ai",
            role: m.role,
            content: m.text,
            text: m.text,
            timestamp: m.timestamp,
          })),
        score: {
          objectionHandling: 0,
          questioning: 0,
          closing: 0,
          total: 0,
          questionsAsked: 0,
          hesitations: 0,
          ignoredObjections: 0,
          closingAttemptExchange: 0,
        },
        startedAt: sessionStartRef.current || endedAt,
        endedAt,
        durationSeconds,
        talkTimeRepPercent: Math.round((repChars / totalChars) * 100),
        talkTimeAiPercent: Math.round((aiChars / totalChars) * 100),
        scriptId: snap.currentScriptId ?? null,
        partial: true,
        completedAt: endedAt,
      }).catch(() => {
        /* silent — partial save is best-effort */
      });
    };
  }, []); // runs only on unmount — snapshot ref is always current

  // ── handleToggleVoiceMode ──────────────────────────────────────────────────
  const handleToggleVoiceMode = useCallback(() => {
    if (!stt.isSupported) return;
    tts.stop();
    stt.stopListening();
    stopNatural();
    setNaturalMode(false);
    setVoiceMode((prev) => !prev);
  }, [stt, tts, stopNatural]);

  // ── handleToggleNaturalMode ────────────────────────────────────────────────
  const handleToggleNaturalMode = useCallback(() => {
    if (!stt.isSupported) return;
    const enabling = !naturalModeRef.current;
    tts.stop();
    stt.stopListening();
    if (enabling) {
      setVoiceMode(true); // natural mode implies voice mode
      setNaturalMode(true);
      naturalActiveRef.current = true;
      setTimeout(() => startNatural(), 300);
    } else {
      stopNatural();
      setNaturalMode(false);
      naturalActiveRef.current = false;
    }
  }, [stt, tts, startNatural, stopNatural]);

  // ── handleMicClick — interruption support + click sound ───────────────────
  // Interruption is feature-flag controlled (interruptionEnabled in Firestore settings).
  const handleMicClick = useCallback(() => {
    // Always stop TTS before starting to listen — prevents duplicate transcripts
    stopSpeechRef.current();
    // Stop any existing STT before starting fresh
    stt.stopListening();
    playClickSound();
    stt.startListening();
  }, [stt, aiSettings.interruptionEnabled]);

  // ── handleStart ────────────────────────────────────────────────────────────
  const handleStart = useCallback(
    (scenarioId: ScenarioType, diff: Difficulty, personaId: PersonaType, scriptId?: string) => {
      const sc = SCENARIOS.find((s) => s.id === scenarioId)!;
      const p = PERSONAS[personaId];
      setScenario(sc);
      setPersona(p);
      setDifficulty(diff);
      setCurrentScriptId(scriptId ?? null);
      setSessionState("active");
      setConvState(initState());

      // Record session start time for duration calculation
      sessionStartRef.current = Date.now();

      // AI does NOT speak first. Store opening line for when the user speaks.
      // Start with empty messages so the prompt "Start speaking to begin" is shown.
      setMessages([]);

      // Start Natural Mode listening if enabled
      if (naturalModeRef.current) {
        naturalActiveRef.current = true;
        setTimeout(() => startNatural(), 400);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aiSettings, startNatural],
  );

  // ── handleSend ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    (text: string) => {
      if (!scenario || !persona) return;
      // Interrupt any playing TTS when the user sends a message
      stopSpeechRef.current();

      const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: "user", text, timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      // Base text-display delay (natural typing feel)
      const displayDelay = 600 + Math.random() * 1000;
      setTimeout(() => {
        const exchangeCount = messages.filter((m) => m.role === "user").length;
        const { response, newState } = generateResponse(scenario, persona, difficulty, convState, text, exchangeCount);
        setConvState(newState);

        const aiMsg: ChatMessage = { id: `ai-${Date.now()}`, role: "ai", text: response, timestamp: Date.now() };
        const allMessages = [...messages, userMsg, aiMsg];
        setMessages(allMessages);
        setLoading(false);

        // In voice mode: extra "thinking" delay before AI speaks (from Firestore settings)
        if (voiceModeRef.current) {
          const { thinkingDelayMin, thinkingDelayMax } = aiSettings;
          const thinkDelay = thinkingDelayMin + Math.random() * (thinkingDelayMax - thinkingDelayMin);
          setTimeout(() => speakRef.current(response), thinkDelay);
        }

        // Check end conditions
        const totalExchanges = exchangeCount + 1;
        if (totalExchanges >= scenario.maxExchanges || newState.phase === "closed" || newState.hardShutdownTriggered) {
          handleEnd(allMessages, newState);
        }
      }, displayDelay);
    },
    [scenario, persona, difficulty, convState, messages],
  );

  // Keep handleSendRef current so STT can always call the latest version
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // ── handleEnd ─────────────────────────────────────────────────────────────
  const handleEnd = useCallback(
    async (finalMessages: ChatMessage[], finalConvState: ConversationState) => {
      if (!scenario || !persona) return;
      // Stop any voice activity when session ends
      stopSpeechRef.current();
      stt.stopListening();
      stopNatural();
      naturalActiveRef.current = false;

      const evaluatedScore = evaluateSession(finalMessages, scenario, finalConvState);
      evaluatedScore.total = evaluatedScore.objectionHandling + evaluatedScore.questioning + evaluatedScore.closing;
      const fb = getFeedback(evaluatedScore, persona);

      // ── v3: compute section scores + structured feedback ──────────────────
      const sectionScores = computeSectionScores(finalMessages);
      const structuredFeedback = generateStructuredFeedback(evaluatedScore, finalMessages, persona);

      // ── v3: timing + talk time ────────────────────────────────────────────
      const endedAt = Date.now();
      const startedAt = sessionStartRef.current || endedAt;
      const durationSeconds = Math.round((endedAt - startedAt) / 1000);

      const repMsgs = finalMessages.filter((m) => m.role === "user");
      const aiMsgs = finalMessages.filter((m) => m.role === "ai");
      const repChars = repMsgs.reduce((s, m) => s + m.text.length, 0);
      const aiChars = aiMsgs.reduce((s, m) => s + m.text.length, 0);
      const totalChars = repChars + aiChars || 1;
      const talkTimeRepPercent = Math.round((repChars / totalChars) * 100);
      const talkTimeAiPercent = Math.round((aiChars / totalChars) * 100);

      setScore(evaluatedScore);
      setFeedback(fb);
      setSessionState("ended");

      // ── Enhanced AI analysis (Phase 1 coaching) ─────────────────────────
      const mappedMessages = finalMessages.map((m) => ({
        role: m.role as "user" | "ai",
        text: m.text,
        timestamp: m.timestamp,
      }));

      const scenarioMap = {
        id: scenario.id,
        title: scenario.label,
        description: scenario.description,
        personality: {
          type: persona.communicationStyle.includes("pointed")
            ? ("analytical" as const)
            : persona.communicationStyle.includes("short") || persona.communicationStyle.includes("fast")
              ? ("busy" as const)
              : persona.demeanor.includes("guard") || persona.demeanor.includes("cautious")
                ? ("skeptical" as const)
                : ("friendly" as const),
          traits: {
            riskAverse: persona.primaryConcerns.some((c) => c === "risk" || c === "credibility" || c === "cost"),
            priceSensitive: persona.primaryConcerns.some(
              (c) => c === "cost" || c === "value for money" || c === "hidden fees",
            ),
            talkative:
              persona.communicationStyle.includes("short") || persona.communicationStyle.includes("fast")
                ? false
                : true,
          },
          openingLine: persona.openingVariant,
          responseStyle: persona.communicationStyle.includes("pointed")
            ? ("questioning" as const)
            : persona.communicationStyle.includes("short")
              ? ("short" as const)
              : ("detailed" as const),
        },
        linkedKBIds: [],
        difficulty: difficulty,
        goal: scenario.goal,
        maxExchanges: scenario.maxExchanges,
      };

      const analysis = analyseSession(mappedMessages, scenarioMap, evaluatedScore);
      setSessionAnalysis(analysis);

      // Save to Firestore — full v3 document
      if (currentUser?.id) {
        try {
          await addDoc(collection(db, "trainingSessions"), {
            // Identity
            repId: currentUser.id,
            repName: currentUser.name,
            userId: String(currentUser.id), // legacy compat
            userName: currentUser.name, // legacy compat
            // Session meta
            scenarioType: scenario.id,
            scriptType: scenario.id,
            difficulty,
            personaType: persona.id,
            scriptId: currentScriptId ?? null,
            voiceMode: voiceModeRef.current,
            // Messages — v3 sender/content format + v1 legacy fields
            messages: finalMessages
              .filter((m) => m.role !== "system")
              .map((m) => ({
                sender: m.role === "user" ? "rep" : "ai",
                role: m.role, // v1 legacy
                content: m.text,
                text: m.text, // v1 legacy
                timestamp: m.timestamp,
              })),
            // Scores
            score: evaluatedScore,
            feedback: fb,
            sectionScores,
            structuredFeedback,
            // v2 analysis summary fields (top-level for dashboard queries)
            questionsAsked: evaluatedScore.questionsAsked,
            hesitations: evaluatedScore.hesitations,
            ignoredObjections: evaluatedScore.ignoredObjections,
            closingAttemptExchange: evaluatedScore.closingAttemptExchange,
            // Timing
            startedAt,
            endedAt,
            completedAt: endedAt,
            durationSeconds,
            talkTimeRepPercent,
            talkTimeAiPercent,
            partial: false,
          });
        } catch (err) {
          console.error("Failed to save training session:", err);
        }
      }
    },
    [scenario, persona, difficulty, currentUser, currentScriptId, stt, stopNatural],
  );

  // ── handleRetry / handleBack ───────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (!scenario || !persona) return;
    tts.stop();
    stt.stopListening();
    stopNatural();
    setSessionState("active");
    setConvState(initState());
    setMessages([]); // AI does not speak first on retry either
    setScore(null);
    setFeedback("");
    sessionStartRef.current = Date.now();
    if (naturalModeRef.current) {
      naturalActiveRef.current = true;
      setTimeout(() => startNatural(), 400);
    }
  }, [scenario, persona, stt, tts, stopNatural, startNatural]);

  const handleBack = useCallback(() => {
    tts.stop();
    stt.stopListening();
    stopNatural();
    naturalActiveRef.current = false;
    setSessionState("setup");
    setScenario(null);
    setPersona(null);
    setCurrentScriptId(null);
    setMessages([]);
    setScore(null);
    setFeedback("");
    setConvState(initState());
  }, [stt, tts]);

  // ── Progression data (for SetupPanel unlock logic) ────────────────────────
  // Imported lazily — no extra Firestore listener; derived from sessions in Dashboard
  // For SetupPanel we just compute a quick unlock check inline from localStorage cache
  // (full progression lives in RoleplayDashboard via useTrainingProgress)
  const hardUnlocked = true; // always allow for now — Dashboard enforces soft guidance

  // ── Render ────────────────────────────────────────────────────────────────
  if (sessionState === "setup") {
    return <SetupPanel onStart={handleStart} hardUnlocked={hardUnlocked} />;
  }

  if (sessionState === "ended" && score && scenario && persona) {
    return (
      <ResultsScreen
        score={score}
        feedback={feedback}
        sessionAnalysis={sessionAnalysis}
        scenario={scenario}
        difficulty={difficulty}
        persona={persona}
        onRetry={handleRetry}
        onBack={handleBack}
      />
    );
  }

  if (scenario && persona) {
    return (
      <div className="flex flex-col" style={{ minHeight: "60vh" }}>
        <ChatInterface
          scenario={scenario}
          persona={persona}
          difficulty={difficulty}
          messages={messages}
          onSend={handleSend}
          onEnd={() => handleEnd(messages, convState)}
          loading={loading}
          voiceMode={voiceMode}
          onToggleVoiceMode={handleToggleVoiceMode}
          voiceSupported={stt.isSupported}
          voiceModeEnabled={featureFlags.enableVoiceMode}
          sttStatus={stt.status}
          sttTranscript={naturalMode ? naturalTranscript : stt.transcript}
          sttError={stt.error}
          onMicClick={naturalMode ? () => {} : handleMicClick}
          isSpeaking={tts.isSpeaking}
          onStopSpeech={tts.stop}
          currentScript={currentScript}
          naturalMode={naturalMode}
          onToggleNaturalMode={handleToggleNaturalMode}
          naturalStatus={naturalStatus}
        />
      </div>
    );
  }

  return null;
}

export default AIRoleplayPage;
