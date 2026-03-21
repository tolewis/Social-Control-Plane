/**
 * AI Slop Detector — rule-based, no AI.
 * Patterns sourced from github.com/hardikpandya/stop-slop
 */

export interface SlopMatch {
  category: string;
  match: string;
  /** Character offset in the original text */
  index: number;
}

export interface SlopResult {
  score: number;        // 0–100, higher = more slop
  rating: number;       // 0–10 scale (ceil of score/10)
  matches: SlopMatch[];
  label: string;        // "Clean" | "Minor" | "Heavy"
}

/* ------------------------------------------------------------------ */
/*  Pattern definitions                                                */
/* ------------------------------------------------------------------ */

const PHRASE_PATTERNS: [string, RegExp][] = [
  // Throat-clearing openers
  ["Throat-clearing opener", /\b(?:here'?s the thing|here'?s what|here'?s why|the uncomfortable truth is|it turns out|the real \w+ is|let me be clear|the truth is|i'?ll say it again|i'?m going to be honest|can we talk about|here'?s what i find interesting|here'?s the problem)\b/gi],

  // Emphasis crutches
  ["Emphasis crutch", /\b(?:full stop|let that sink in|this matters because|make no mistake|here'?s why that matters)\b/gi],
  ["Emphasis crutch", /\.\s*Period\./gi],

  // Filler phrases
  ["Filler phrase", /\b(?:at its core|in today'?s \w+|it'?s worth noting|at the end of the day|when it comes to|in a world where|the reality is)\b/gi],

  // Business jargon
  ["Business jargon", /\b(?:navigate (?:the |these |those )?challenges?|unpack (?:the |this |that )?|lean(?:ing)? into|(?:the |this )?landscape|game[- ]?changer|double(?:d)? down|deep dive|take a step back|moving forward|circle back|on the same page)\b/gi],

  // Adverbs / softeners
  ["Adverb/softener", /\b(?:genuinely|honestly|simply|fundamentally|inherently|inevitably|interestingly|importantly|crucially|deeply|truly)\b/gi],

  // Meta-commentary
  ["Meta-commentary", /\b(?:hint:|plot twist:|spoiler:|you already know this|but that'?s another post|is a feature,? not a bug|dressed up as|the rest of this (?:essay|post|article)|let me walk you through|in this section|as we'?ll see|i want to explore)\b/gi],

  // Performative emphasis
  ["Performative emphasis", /\b(?:creeps? in|i promise|they exist,? i promise)\b/gi],

  // Telling instead of showing
  ["Telling not showing", /\b(?:this is genuinely hard|this is what (?:leadership|it) actually looks like|actually matters)\b/gi],

  // Vague declaratives
  ["Vague declarative", /\b(?:the reasons are structural|the implications are significant|this is the deepest problem|the stakes are high|the consequences are real)\b/gi],
];

const STRUCTURE_PATTERNS: [string, RegExp][] = [
  // Em dashes
  ["Em dash", /\u2014/g],
  ["Em dash (double hyphen)", /(?<!\w)--(?!\w)/g],

  // Binary contrasts
  ["Binary contrast", /\bnot because .{3,40}?\. because\b/gi],
  ["Binary contrast", /\bisn'?t (?:the |a )?(?:problem|answer|question)\. .{3,30}? is\./gi],
  ["Binary contrast", /\bit feels like .{3,30}\. it'?s actually\b/gi],
  ["Binary contrast", /\bstops being .{3,30} and starts being\b/gi],
  ["Binary contrast", /\bnot just .{3,30} but also\b/gi],

  // Dramatic fragmentation — "That's it. That's the"
  ["Dramatic fragment", /\bthat'?s it\.\s*that'?s the\b/gi],

  // Rhetorical setups
  ["Rhetorical setup", /\b(?:what if (?:we |you |i )?(?:could|were|had)|here'?s what i mean:|think about it:?|and that'?s okay\.?)\b/gi],

  // False agency
  ["False agency", /\b(?:the (?:conversation|culture|market|decision|data) (?:shifts?|moves?|rewards?|tells?|emerges?))\b/gi],

  // Passive voice indicators
  ["Passive voice", /\b(?:was created|is believed|were made|was reached|was decided|been established|is considered|was determined)\b/gi],

  // Staccato "Not X. Not Y."
  ["Staccato hedging", /\bnot \w+\.\s*not \w+\./gi],
];

/* ------------------------------------------------------------------ */
/*  Detector                                                           */
/* ------------------------------------------------------------------ */

export function detectSlop(text: string): SlopResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, rating: 0, matches: [], label: 'Clean' };
  }

  const matches: SlopMatch[] = [];

  for (const [category, pattern] of [...PHRASE_PATTERNS, ...STRUCTURE_PATTERNS]) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({
        category,
        match: m[0],
        index: m.index,
      });
    }
  }

  // Deduplicate overlapping matches (keep the longer one)
  matches.sort((a, b) => a.index - b.index);
  const deduped: SlopMatch[] = [];
  for (const m of matches) {
    const prev = deduped[deduped.length - 1];
    if (prev && m.index < prev.index + prev.match.length) {
      // Overlapping — keep the longer match
      if (m.match.length > prev.match.length) {
        deduped[deduped.length - 1] = m;
      }
    } else {
      deduped.push(m);
    }
  }

  // Score: base on match density relative to word count
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const matchCount = deduped.length;

  // Rough scoring: each match adds points, scaled to post length
  // Short posts (tweets) are penalized more per match
  const perMatchWeight = wordCount < 50 ? 15 : wordCount < 150 ? 10 : 6;
  const rawScore = matchCount * perMatchWeight;
  const score = Math.min(100, rawScore);

  let label: string;
  if (score === 0) label = 'Clean';
  else if (score <= 20) label = 'Minor';
  else label = 'Heavy';

  const rating = Math.ceil(score / 10);  // 0–10 scale

  return { score, rating, matches: deduped, label };
}

/**
 * Group matches by category for display.
 */
export function groupSlopMatches(matches: SlopMatch[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const m of matches) {
    const list = groups.get(m.category) || [];
    // Avoid duplicate match text within the same category
    const text = m.match.length > 40 ? m.match.slice(0, 40) + '…' : m.match;
    if (!list.includes(text)) list.push(text);
    groups.set(m.category, list);
  }
  return groups;
}
