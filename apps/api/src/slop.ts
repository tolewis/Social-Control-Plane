/**
 * AI Slop Detector — rule-based, no AI.
 * Patterns sourced from github.com/hardikpandya/stop-slop
 */

export interface SlopMatch {
  category: string;
  match: string;
  index: number;
}

export interface SlopResult {
  score: number;
  rating: number;   // 0–10 scale (ceil of score/10)
  matches: SlopMatch[];
  label: 'Clean' | 'Minor' | 'Heavy';
  flagCount: number;
}

const PHRASE_PATTERNS: [string, RegExp][] = [
  ["Throat-clearing opener", /\b(?:here'?s the thing|here'?s what|here'?s why|the uncomfortable truth is|it turns out|the real \w+ is|let me be clear|the truth is|i'?ll say it again|i'?m going to be honest|can we talk about|here'?s what i find interesting|here'?s the problem)\b/gi],
  ["Emphasis crutch", /\b(?:full stop|let that sink in|this matters because|make no mistake|here'?s why that matters)\b/gi],
  ["Emphasis crutch", /\.\s*Period\./gi],
  ["Filler phrase", /\b(?:at its core|in today'?s \w+|it'?s worth noting|at the end of the day|when it comes to|in a world where|the reality is)\b/gi],
  ["Business jargon", /\b(?:navigate (?:the |these |those )?challenges?|unpack (?:the |this |that )?|lean(?:ing)? into|(?:the |this )?landscape|game[- ]?changer|double(?:d)? down|deep dive|take a step back|moving forward|circle back|on the same page)\b/gi],
  ["Adverb/softener", /\b(?:genuinely|honestly|simply|fundamentally|inherently|inevitably|interestingly|importantly|crucially|deeply|truly)\b/gi],
  ["Meta-commentary", /\b(?:hint:|plot twist:|spoiler:|you already know this|but that'?s another post|is a feature,? not a bug|dressed up as|the rest of this (?:essay|post|article)|let me walk you through|in this section|as we'?ll see|i want to explore)\b/gi],
  ["Performative emphasis", /\b(?:creeps? in|i promise|they exist,? i promise)\b/gi],
  ["Telling not showing", /\b(?:this is genuinely hard|this is what (?:leadership|it) actually looks like|actually matters)\b/gi],
  ["Vague declarative", /\b(?:the reasons are structural|the implications are significant|this is the deepest problem|the stakes are high|the consequences are real)\b/gi],
];

const STRUCTURE_PATTERNS: [string, RegExp][] = [
  ["Em dash", /\u2014/g],
  ["Em dash (double hyphen)", /(?<!\w)--(?!\w)/g],
  ["Binary contrast", /\bnot because .{3,40}?\. because\b/gi],
  ["Binary contrast", /\bisn'?t (?:the |a )?(?:problem|answer|question)\. .{3,30}? is\./gi],
  ["Binary contrast", /\bit feels like .{3,30}\. it'?s actually\b/gi],
  ["Binary contrast", /\bstops being .{3,30} and starts being\b/gi],
  ["Binary contrast", /\bnot just .{3,30} but also\b/gi],
  ["Dramatic fragment", /\bthat'?s it\.\s*that'?s the\b/gi],
  ["Rhetorical setup", /\b(?:what if (?:we |you |i )?(?:could|were|had)|here'?s what i mean:|think about it:?|and that'?s okay\.?)\b/gi],
  ["False agency", /\b(?:the (?:conversation|culture|market|decision|data) (?:shifts?|moves?|rewards?|tells?|emerges?))\b/gi],
  ["Passive voice", /\b(?:was created|is believed|were made|was reached|was decided|been established|is considered|was determined)\b/gi],
  ["Staccato hedging", /\bnot \w+\.\s*not \w+\./gi],
];

export function detectSlop(text: string): SlopResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, matches: [], label: 'Clean', flagCount: 0 };
  }

  const matches: SlopMatch[] = [];

  for (const [category, pattern] of [...PHRASE_PATTERNS, ...STRUCTURE_PATTERNS]) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({ category, match: m[0], index: m.index });
    }
  }

  // Deduplicate overlapping matches
  matches.sort((a, b) => a.index - b.index);
  const deduped: SlopMatch[] = [];
  for (const m of matches) {
    const prev = deduped[deduped.length - 1];
    if (prev && m.index < prev.index + prev.match.length) {
      if (m.match.length > prev.match.length) {
        deduped[deduped.length - 1] = m;
      }
    } else {
      deduped.push(m);
    }
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const matchCount = deduped.length;
  const perMatchWeight = wordCount < 50 ? 15 : wordCount < 150 ? 10 : 6;
  const rawScore = matchCount * perMatchWeight;
  const score = Math.min(100, rawScore);

  let label: 'Clean' | 'Minor' | 'Heavy';
  if (score === 0) label = 'Clean';
  else if (score <= 20) label = 'Minor';
  else label = 'Heavy';

  const rating = Math.ceil(score / 10);  // 0–10 scale

  return { score, rating, matches: deduped, label, flagCount: deduped.length };
}

/**
 * Group matches by category.
 */
export function groupSlopMatches(matches: SlopMatch[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const m of matches) {
    if (!groups[m.category]) groups[m.category] = [];
    const text = m.match.length > 40 ? m.match.slice(0, 40) + '…' : m.match;
    if (!groups[m.category].includes(text)) groups[m.category].push(text);
  }
  return groups;
}
