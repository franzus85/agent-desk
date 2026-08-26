import type { SyntheticSkillSpec } from "../generate.js";
import { selectFromCandidates, type SelectionStrategy } from "./types.js";

// Words that appear in every skill's description template ("Searches X by
// keyword.", "Lists all X.", "Fetches a single X by id.", "Creates a new
// X.") — they carry no discriminating signal since they'd match everything.
const STOPWORDS = new Set(["a", "an", "the", "by", "of", "for", "to", "in", "on", "at", "is", "are", "this", "new", "all", "single", "keyword", "id"]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0 && !STOPWORDS.has(token)),
  );
}

function vocabulary(skill: SyntheticSkillSpec): Set<string> {
  return new Set([...tokenize(skill.name), ...tokenize(skill.description)]);
}

// Deterministic, no model call: score each skill by token overlap with the
// prompt, keep only the top K. Deliberately no fallback to "everything" when
// nothing scores — a hard/paraphrased prompt that matches nothing is exactly
// the failure mode this tier exists to expose (and Tier 2 retrieval exists
// to fix).
export function keywordFilter(prompt: string, skills: SyntheticSkillSpec[], topK = 10): SyntheticSkillSpec[] {
  const promptTokens = tokenize(prompt);
  return skills
    .map((skill) => {
      const vocab = vocabulary(skill);
      let score = 0;
      for (const token of promptTokens) {
        if (vocab.has(token)) score++;
      }
      return { skill, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => entry.skill);
}

export const tier1KeywordStrategy: SelectionStrategy = {
  name: "tier1-keyword",
  select: (client, task, skills) => selectFromCandidates(client, task, keywordFilter(task.prompt, skills)),
};
