/**
 * Heuristic memory extraction from conversation turns.
 * Detects personal facts, preferences, and key info that Luna should remember.
 */

const PATTERNS: { regex: RegExp; extract: (match: RegExpMatchArray) => string }[] = [
  { regex: /my name is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i, extract: (m) => `User's name is ${m[1]}` },
  { regex: /(?:call me|go by|i'm called) ([A-Z][a-z]+)/i, extract: (m) => `User goes by ${m[1]}` },
  { regex: /i work (?:at|for) (.+?)(?:\.|,|$)/i, extract: (m) => `User works at ${m[1].trim()}` },
  { regex: /i(?:'m| am) a ([a-z][\w\s]+?)(?:\.|,| and| who| at|$)/i, extract: (m) => `User is a ${m[1].trim()}` },
  { regex: /i live in (.+?)(?:\.|,|$)/i, extract: (m) => `User lives in ${m[1].trim()}` },
  { regex: /i(?:'m| am) from (.+?)(?:\.|,|$)/i, extract: (m) => `User is from ${m[1].trim()}` },
  { regex: /i prefer (.+?)(?:\.|,| over| instead|$)/i, extract: (m) => `User prefers ${m[1].trim()}` },
  { regex: /i (?:mostly |usually |primarily )?use (.+?)(?:\.|,| for| and|$)/i, extract: (m) => `User uses ${m[1].trim()}` },
  { regex: /i like (.+?)(?:\.|,|$)/i, extract: (m) => `User likes ${m[1].trim()}` },
  { regex: /i love (.+?)(?:\.|,|$)/i, extract: (m) => `User loves ${m[1].trim()}` },
  { regex: /my favorite (.+?) is (.+?)(?:\.|,|$)/i, extract: (m) => `User's favorite ${m[1].trim()} is ${m[2].trim()}` },
  { regex: /i(?:'m| am) learning (.+?)(?:\.|,|$)/i, extract: (m) => `User is learning ${m[1].trim()}` },
  { regex: /i(?:'m| am) studying (.+?)(?:\.|,|$)/i, extract: (m) => `User is studying ${m[1].trim()}` },
  { regex: /i(?:'m| am) building (.+?)(?:\.|,|$)/i, extract: (m) => `User is building ${m[1].trim()}` },
  { regex: /i(?:'m| am) working on (.+?)(?:\.|,|$)/i, extract: (m) => `User is working on ${m[1].trim()}` },
  { regex: /i speak (.+?)(?:\.|,|$)/i, extract: (m) => `User speaks ${m[1].trim()}` },
  { regex: /my (?:programming )?language of choice is (.+?)(?:\.|,|$)/i, extract: (m) => `User's language of choice is ${m[1].trim()}` },
  { regex: /i(?:'m| am) (\d+) years old/i, extract: (m) => `User is ${m[1]} years old` },
  { regex: /my(?:\s\w+)? birthday is (.+?)(?:\.|,|$)/i, extract: (m) => `User's birthday is ${m[1].trim()}` },
  { regex: /i(?:'m| am) interested in (.+?)(?:\.|,|$)/i, extract: (m) => `User is interested in ${m[1].trim()}` },
];

/** Maximum length for a single extracted memory string. */
const MAX_MEMORY_LENGTH = 120;

/**
 * Extract potential memories from a user message.
 * Only analyzes the user's message (not assistant response) to avoid
 * picking up the AI's own phrasing.
 */
export function extractMemories(userMessage: string, _assistantResponse: string): string[] {
  const results: string[] = [];

  for (const { regex, extract } of PATTERNS) {
    const match = userMessage.match(regex);
    if (match) {
      const memory = extract(match);
      if (memory.length > 5 && memory.length <= MAX_MEMORY_LENGTH) {
        results.push(memory);
      }
    }
  }

  // Deduplicate within this extraction
  return [...new Set(results)];
}
