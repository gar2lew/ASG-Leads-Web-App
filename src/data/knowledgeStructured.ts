/**
 * knowledgeStructured.ts — Structured knowledge base for AI-assisted training.
 *
 * Each item is tagged with type, tags, examples, and links to training scenarios.
 * This is the canonical source for smart search and scenario linking.
 *
 * These items coexist with the existing KBArticle system (Firestore-backed HTML).
 * They provide structured, machine-readable knowledge for the AI coaching system.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type KBItemType = "objection" | "script" | "process" | "strategy";

export interface KBItem {
  id: string;
  type: KBItemType;
  title: string;
  content: string; // plain text description
  examples: string[]; // example responses the rep can adapt
  tags: string[]; // searchable tags
  scenarioLink?: string; // scenario ID to launch for practice
  relatedIds?: string[]; // related KB items
}

export interface SearchHit {
  item: KBItem;
  score: number; // 0–1 relevance
  matchedTags: string[];
  matchedContent: string[];
}

// ── Knowledge Items ─────────────────────────────────────────────────────────

export const STRUCTURED_KB: KBItem[] = [
  // ─── OBJECTIONS ───────────────────────────────────────────────────────────
  {
    id: "obj-smsf-too-risky",
    type: "objection",
    title: "SMSF is too risky for me",
    content:
      "Clients often express concern about the risk of self-managed super. The key is to acknowledge their concern, explain the control SMSF gives them, and provide data on performance versus retail funds.",
    examples: [
      "I completely understand that concern. The difference with an SMSF is you're not taking on more risk — you're taking on more control. You decide what's invested and when. With a retail fund, the fund manager makes those calls.",
      "That's a very common concern. What the data shows is that SMSFs with a clear strategy actually outperform 60% of retail funds over a 10-year period. The key is having the right structure and advice in place.",
    ],
    tags: ["smsf", "risk", "objection", "self-managed", "control", "performance"],
    scenarioLink: "smsf-objection",
  },
  {
    id: "obj-fees-too-high",
    type: "objection",
    title: "Your fees are too high",
    content:
      "Price objections are often about value perception, not the actual dollar amount. Reframe the conversation around outcomes and ROI rather than cost.",
    examples: [
      "I hear you — fees are important. Let me ask: what would it be worth to you if we could save you $50,000 over the life of the loan? Our fee is a fraction of that.",
      "That's fair to think about. What I'd suggest is we focus on the outcome first — if the numbers stack up for you, the fee takes care of itself. Let me show you what's possible.",
    ],
    tags: ["fees", "price", "objection", "cost", "value", "expensive"],
    scenarioLink: "pia-explanation",
  },
  {
    id: "obj-need-time-think",
    type: "objection",
    title: "I need time to think about it",
    content:
      "When a client asks for time, they usually have an unspoken concern. Probe gently to understand what specifically they need to think through.",
    examples: [
      "Of course — this is a big decision. Can I ask, is there anything specific you'd like more clarity on? I want to make sure you have everything you need to feel confident.",
      "Absolutely, take the time you need. Usually when people say that, there's one or two things they're still unsure about. What's the biggest question on your mind right now?",
    ],
    tags: ["time", "think", "objection", "hesitation", "unsure"],
    scenarioLink: "follow-up-close",
  },
  {
    id: "obj-already-have-adviser",
    type: "objection",
    title: "I already have a financial adviser",
    content:
      "When a client mentions an existing adviser, don't compete — position yourself as a complement. Offer a second opinion at no obligation.",
    examples: [
      "That's great — it's smart to have professional advice. What I'd offer is a complimentary second opinion. If what you've got is working perfectly, fantastic. If there's something we can improve, it's on the house.",
      "Wonderful. I won't try to replace them. But I specialise in property strategy and SMSF — areas some advisers don't focus on. Happy to do a quick review of those specific areas for you.",
    ],
    tags: ["adviser", "already", "objection", "competition", "second opinion"],
    scenarioLink: "discovery-conversation",
  },

  // ─── SCRIPTS ──────────────────────────────────────────────────────────────
  {
    id: "script-dq-opening",
    type: "script",
    title: "DQ Conversation Opening Script",
    content:
      "The opening of a DQ call sets the tone for the entire conversation. Be warm, direct, and purposeful. Get to the point within the first 15 seconds.",
    examples: [
      "Hi [Name], it's [Rep] from Amplify Solutions Group. I'm calling about the enquiry you submitted — do you have a quick minute?",
      "Hi [Name], [Rep] here. Thanks for your interest — I'd love to understand your situation and see if we can help. Got a minute?",
    ],
    tags: ["dq", "opening", "script", "introduction", "first contact", "booking call"],
    scenarioLink: "dq-conversation",
  },
  {
    id: "script-fc-structure",
    type: "script",
    title: "First Consult Appointment Structure",
    content:
      "The FC appointment follows a specific structure: rapport building → discovery → presentation → close. Each phase has a purpose and a time limit.",
    examples: [
      "Phase 1 — Rapport (5 min): Set the client at ease, explain the agenda. 'Today I want to understand your situation and show you what's possible.'",
      "Phase 2 — Discovery (15 min): Ask open questions about their goals, current situation, concerns. Listen more than you talk.",
      "Phase 3 — Presentation (15 min): Present the strategy based on what you've learned. Use their words, not jargon.",
      "Phase 4 — Close (10 min): Ask for the commitment. 'Based on what we've discussed, does this feel like the right direction?'",
    ],
    tags: ["fc", "first consult", "script", "structure", "appointment", "presentation"],
    scenarioLink: "fc-appointment",
  },
  {
    id: "script-fr-close",
    type: "script",
    title: "Finance Run Close Script",
    content:
      "The FR close is about confirming the numbers, addressing final concerns, and getting commitment to move to the next step.",
    examples: [
      "Here are the numbers we discussed. The strategy works in your favour — does everything make sense? [Pause] Great. The next step is [next step]. Shall we lock that in?",
      "I've walked you through the full picture. My recommendation is [recommendation] because [reason tied to their stated goal]. How does that feel to you?",
    ],
    tags: ["fr", "finance run", "close", "script", "commitment", "next step"],
    scenarioLink: "fr-close",
  },

  // ─── PROCESSES ────────────────────────────────────────────────────────────
  {
    id: "process-lead-to-deal",
    type: "process",
    title: "Lead to Deal Pipeline Process",
    content:
      "The journey from a DQ lead to a settled deal follows a defined pipeline. Understanding each stage helps reps guide clients effectively.",
    examples: [
      "DQ → Booked: Appointment (FC) scheduled with the client",
      "Booked → FC Complete: First consult delivered, strategy presented",
      "FC → FR: Finance run booked and completed",
      "FR → Settlement: Application submitted, approved, settlement in progress",
      "Settlement → Complete: Deal settled, commissions allocated",
    ],
    tags: ["pipeline", "process", "stages", "lead", "deal", "fc", "fr", "settlement"],
  },
  {
    id: "process-callback-handling",
    type: "process",
    title: "Callback Handling Process",
    content:
      "Callbacks are the lifeblood of the pipeline. Every call should end with a clear next action — either a callback scheduled or a deal progressed.",
    examples: [
      "If the client is interested but busy: 'No worries — when's a better time? I can call you back [suggest specific day/time].'",
      "If the client needs more info: 'I'll send through the details we discussed. Let's catch up on [day] to go through them together.'",
      "If the client is hesitant: 'I understand. Let's touch base in a couple of days — no pressure, just to see where you're at.'",
    ],
    tags: ["callback", "process", "follow-up", "next action", "scheduling"],
  },

  // ─── STRATEGIES ───────────────────────────────────────────────────────────
  {
    id: "strategy-value-reframe",
    type: "strategy",
    title: "Value Reframe Strategy",
    content:
      "When clients focus on cost, reframe the conversation around value and outcomes. Shift from 'what it costs' to 'what it delivers.'",
    examples: [
      "Instead of talking about fees, talk about the $ amount saved or earned. 'Our service has helped clients save an average of $47,000. Our fee is less than 2% of that.'",
      "Connect the cost to their personal goal. 'You mentioned wanting to secure your retirement. This strategy is designed to add $X to your super over 5 years. The fee is the cost of that outcome.'",
    ],
    tags: ["value", "reframe", "strategy", "fees", "roi", "outcome"],
  },
  {
    id: "strategy-urgency-creation",
    type: "strategy",
    title: "Creating Appropriate Urgency",
    content:
      "Urgency must be genuine, not manufactured. Use market conditions, rate changes, or policy updates to create legitimate urgency without being pushy.",
    examples: [
      "The rate environment is shifting — what's available now may not be in 30 days. I'd hate for you to miss this window because we waited.",
      "The government is reviewing these policies next quarter. Acting now means you lock in under the current rules, which are more favourable.",
    ],
    tags: ["urgency", "strategy", "market", "timing", "policy", "genuine"],
  },
  {
    id: "strategy-pia-explanation",
    type: "strategy",
    title: "Property Investment Analysis Explanation",
    content:
      "When explaining PIA to clients, focus on the three pillars: cash flow, capital growth, and tax benefits. Use their numbers, not generic examples.",
    examples: [
      "The PIA looks at three things: how the property pays for itself each week (cash flow), how much it's likely to grow in value over time (capital growth), and how the tax structure works in your favour.",
      "What the analysis shows you is the complete picture — not just the purchase price, but what the property actually costs or earns you every week, and what it could be worth in 5, 10, 15 years.",
    ],
    tags: ["pia", "property investment", "strategy", "cash flow", "growth", "tax", "analysis"],
    scenarioLink: "pia-explanation",
  },
];

// ── Scenario Definitions ─────────────────────────────────────────────────────

export interface TrainingScenario {
  id: string;
  title: string;
  description: string;
  personality: ScenarioPersonality;
  linkedKBIds: string[]; // KB items referenced by this scenario
  difficulty: "easy" | "medium" | "hard";
  goal: string; // what the rep should achieve
  maxExchanges: number;
}

export interface ScenarioPersonality {
  type: "analytical" | "skeptical" | "friendly" | "busy";
  traits: {
    riskAverse: boolean;
    priceSensitive: boolean;
    talkative: boolean;
  };
  openingLine: string;
  responseStyle: string; // "short" | "detailed" | "deflective" | "questioning"
}

/**
 * A variant of a scenario — randomised mood + objection set applied at session start.
 */
export interface ScenarioVariant {
  id: string;
  moodModifier: "optimistic" | "neutral" | "defensive" | "impatient";
  objectionShift: number; // -1 to +1, shifts objection frequency
  customOpeningLine?: string;
  customResponseStyle?: string;
}

/**
 * Generates a random variant for a scenario at session start.
 * Stores the selected variant so it persists throughout the session.
 */
export function generateScenarioVariant(scenarioId: string): ScenarioVariant {
  const moods: ScenarioVariant["moodModifier"][] = ["optimistic", "neutral", "defensive", "impatient"];
  const mood = moods[Math.floor(Math.random() * moods.length)];

  const openingLines: Record<string, Record<string, string>> = {
    "dq-conversation": {
      optimistic: "Hi! I've been expecting a call about this — what do you need to know?",
      defensive: "Look, I've had a few people call already. Make it quick.",
      impatient: "Yeah, I've got about 30 seconds. What's this about?",
    },
    "smsf-objection": {
      optimistic: "I'm open to the idea — I just need to understand the risks better.",
      defensive: "I've heard SMSFs can be risky. Convince me otherwise.",
      impatient: "Everyone's pushing SMSF lately. What's actually in it for me?",
    },
    "pia-explanation": {
      optimistic: "I've been looking at a few properties — can you help me understand the numbers?",
      defensive: "I want to see the actual numbers before I commit to anything.",
      impatient: "I need the bottom line — what's this going to cost me weekly?",
    },
    "fc-appointment": {
      optimistic: "Hi! Thanks for making the time — I'm excited to see what's possible.",
      defensive: "I'm here, but I'm still not 100% sure this is for me.",
      impatient: "Let's get straight to it — what can you actually do for me?",
    },
    "fr-close": {
      optimistic: "The numbers look good — I'm ready to move forward if everything checks out.",
      defensive: "I've reviewed everything but I still have a couple of questions.",
      impatient: "I've seen the numbers. What's the next step?",
    },
    "follow-up-close": {
      optimistic: "I've been thinking about it — I'd like to go ahead actually.",
      defensive: "I've had a think but I'm still not sure.",
      impatient: "I've been busy — what did we agree on again?",
    },
    "discovery-conversation": {
      optimistic: "I already have an adviser, but I'm open to hearing your perspective.",
      defensive: "I'm not sure what you can offer that I'm not already getting.",
      impatient: "I've got someone already. Make this worth my time.",
    },
  };

  const scenarioOpenings = openingLines[scenarioId] || {};
  const customOpening = scenarioOpenings[mood];

  const responseStyles: Record<string, string> = {
    optimistic: "detailed",
    neutral: "questioning",
    defensive: "deflective",
    impatient: "short",
  };

  return {
    id: `${scenarioId}-${Date.now()}`,
    moodModifier: mood,
    objectionShift: mood === "defensive" ? 1 : mood === "impatient" ? 0.5 : mood === "optimistic" ? -0.5 : 0,
    customOpeningLine: customOpening,
    customResponseStyle: responseStyles[mood],
  };
}

export const TRAINING_SCENARIOS: TrainingScenario[] = [
  {
    id: "dq-conversation",
    title: "DQ Conversation",
    description:
      "Practice your opening call to a new DQ lead. Get them engaged and either book an appointment or set a callback.",
    personality: {
      type: "busy",
      traits: { riskAverse: false, priceSensitive: false, talkative: false },
      openingLine: "Hello? Yes, this is them. What's this about?",
      responseStyle: "short",
    },
    linkedKBIds: ["script-dq-opening", "process-callback-handling"],
    difficulty: "easy",
    goal: "Engage the lead and book an appointment or set a callback",
    maxExchanges: 8,
  },
  {
    id: "smsf-objection",
    title: "SMSF Objection Handling",
    description:
      "A client is interested in SMSF but concerned about risk. Address their concerns and move them toward commitment.",
    personality: {
      type: "skeptical",
      traits: { riskAverse: true, priceSensitive: false, talkative: false },
      openingLine: "I've heard about SMSFs but I'm not sure the risk is worth it for me.",
      responseStyle: "deflective",
    },
    linkedKBIds: ["obj-smsf-too-risky", "strategy-value-reframe"],
    difficulty: "medium",
    goal: "Address risk concerns and demonstrate the value of SMSF",
    maxExchanges: 12,
  },
  {
    id: "pia-explanation",
    title: "PIA Explanation",
    description: "Explain a Property Investment Analysis to a client who wants to understand the numbers and benefits.",
    personality: {
      type: "analytical",
      traits: { riskAverse: true, priceSensitive: true, talkative: true },
      openingLine:
        "I'm looking at investment properties but I need to understand the numbers properly before I commit to anything.",
      responseStyle: "questioning",
    },
    linkedKBIds: ["strategy-pia-explanation", "obj-fees-too-high", "obj-need-time-think"],
    difficulty: "medium",
    goal: "Clearly explain the PIA and address all financial concerns",
    maxExchanges: 14,
  },
  {
    id: "fc-appointment",
    title: "First Consult Appointment",
    description: "Run a full FC appointment from rapport building through to presenting the strategy and closing.",
    personality: {
      type: "friendly",
      traits: { riskAverse: false, priceSensitive: false, talkative: true },
      openingLine: "Hi! Thanks for making the time — I've been looking forward to this chat.",
      responseStyle: "detailed",
    },
    linkedKBIds: ["script-fc-structure", "process-lead-to-deal", "strategy-urgency-creation"],
    difficulty: "medium",
    goal: "Complete the full FC structure: rapport → discovery → presentation → close",
    maxExchanges: 16,
  },
  {
    id: "fr-close",
    title: "Finance Run Close",
    description:
      "Present the final numbers and close the deal. The client has seen the analysis — now they need to commit.",
    personality: {
      type: "analytical",
      traits: { riskAverse: true, priceSensitive: true, talkative: false },
      openingLine:
        "I've reviewed the numbers you sent through. They look good, but I have a couple of questions before I commit.",
      responseStyle: "questioning",
    },
    linkedKBIds: ["script-fr-close", "obj-fees-too-high", "strategy-value-reframe"],
    difficulty: "hard",
    goal: "Present numbers, handle final objections, and secure commitment",
    maxExchanges: 10,
  },
  {
    id: "follow-up-close",
    title: "Follow-Up Close",
    description:
      "Follow up with a lead who asked for time to think. Move them toward commitment or get a clear answer.",
    personality: {
      type: "friendly",
      traits: { riskAverse: false, priceSensitive: true, talkative: true },
      openingLine: "Oh hi! Yes, I've been thinking about what we discussed. I've still got a few questions actually.",
      responseStyle: "detailed",
    },
    linkedKBIds: ["obj-need-time-think", "strategy-urgency-creation", "script-fr-close"],
    difficulty: "medium",
    goal: "Re-engage the lead, address remaining concerns, and close",
    maxExchanges: 10,
  },
  {
    id: "discovery-conversation",
    title: "Discovery Conversation",
    description: "Practice your discovery questioning skills. Uncover the client's true goals and concerns.",
    personality: {
      type: "skeptical",
      traits: { riskAverse: false, priceSensitive: false, talkative: false },
      openingLine: "I already have an adviser, so I'm not sure what you can offer that I'm not already getting.",
      responseStyle: "deflective",
    },
    linkedKBIds: ["obj-already-have-adviser", "script-dq-opening", "strategy-value-reframe"],
    difficulty: "hard",
    goal: "Build rapport, uncover needs, and position your value proposition",
    maxExchanges: 10,
  },
];

// ── Smart Search Engine ─────────────────────────────────────────────────────

/**
 * Scores KB items against a natural language query.
 * Returns ranked results with matched tags and content snippets.
 */
export function searchKnowledgeBase(query: string, maxResults = 8): SearchHit[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (tokens.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const item of STRUCTURED_KB) {
    const matchedTags: string[] = [];
    const matchedContent: string[] = [];
    let score = 0;

    // Tag matching (high weight)
    for (const tag of item.tags) {
      for (const token of tokens) {
        if (tag.includes(token) || token.includes(tag)) {
          if (!matchedTags.includes(tag)) matchedTags.push(tag);
          score += 10;
        }
      }
    }

    // Title matching (very high weight)
    const titleLower = item.title.toLowerCase();
    for (const token of tokens) {
      if (titleLower.includes(token)) score += 15;
    }

    // Content matching (lower weight)
    const contentLower = item.content.toLowerCase();
    for (const token of tokens) {
      if (contentLower.includes(token)) {
        const idx = contentLower.indexOf(token);
        const snippet = contentLower.substring(Math.max(0, idx - 20), idx + token.length + 30);
        if (!matchedContent.includes(snippet)) matchedContent.push(snippet);
        score += 3;
      }
    }

    // Examples matching (lowest weight)
    for (const example of item.examples) {
      const exLower = example.toLowerCase();
      for (const token of tokens) {
        if (exLower.includes(token)) score += 1;
      }
    }

    // Normalise score to 0–1
    const maxPossible = tokens.length * (10 + 15 + 3 + 1);
    const normalisedScore = Math.min(1, score / maxPossible);

    if (matchedTags.length > 0 || matchedContent.length > 0) {
      hits.push({ item, score: normalisedScore, matchedTags, matchedContent });
    }
  }

  // Sort by score descending
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, maxResults);
}

/**
 * Find KB items linked to a specific scenario.
 */
export function getKBForScenario(scenarioId: string): KBItem[] {
  const scenario = TRAINING_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return [];
  return STRUCTURED_KB.filter((item) => scenario.linkedKBIds.includes(item.id));
}

/**
 * Find scenarios linked to a specific KB item.
 */
export function getScenariosForKBItem(kbId: string): TrainingScenario[] {
  return TRAINING_SCENARIOS.filter((s) => s.linkedKBIds.includes(kbId));
}
