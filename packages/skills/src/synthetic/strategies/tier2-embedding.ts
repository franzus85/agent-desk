import { embed } from "../embeddings/voyage-client.js";
import type { SyntheticSkillSpec } from "../generate.js";
import type { SelectionTask } from "../tasks.js";
import { selectFromCandidates, type SelectionStrategy } from "./types.js";

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// The 144-skill corpus is fixed for a bench run — embed it once (one batch
// call) instead of once per task. Keyed by reference since every task in a
// run shares the exact same skills array.
let skillEmbeddingsCache: { skills: SyntheticSkillSpec[]; embeddings: number[][] } | null = null;

async function getSkillEmbeddings(skills: SyntheticSkillSpec[]): Promise<number[][]> {
  if (skillEmbeddingsCache?.skills === skills) {
    return skillEmbeddingsCache.embeddings;
  }
  const embeddings = await embed(
    skills.map((skill) => skill.description),
    "document",
  );
  skillEmbeddingsCache = { skills, embeddings };
  return embeddings;
}

interface RankedSkill {
  skill: SyntheticSkillSpec;
  similarity: number;
}

async function rankByEmbedding(task: SelectionTask, skills: SyntheticSkillSpec[]): Promise<RankedSkill[]> {
  const [skillEmbeddings, [queryEmbedding]] = await Promise.all([getSkillEmbeddings(skills), embed([task.prompt], "query")]);
  if (!queryEmbedding) throw new Error("Voyage returned no embedding for the query.");

  return skills
    .map((skill, index) => ({ skill, similarity: cosineSimilarity(queryEmbedding, skillEmbeddings[index] ?? []) }))
    .sort((a, b) => b.similarity - a.similarity);
}

export const tier2EmbeddingStrategy: SelectionStrategy = {
  name: "tier2-embedding",
  async select(client, task, skills) {
    const ranked = await rankByEmbedding(task, skills);
    const candidates = ranked.slice(0, 10).map((entry) => entry.skill);
    const result = await selectFromCandidates(client, task, candidates);
    const rankIndex = ranked.findIndex((entry) => entry.skill.name === task.expectedTool);
    return { ...result, expectedToolRank: rankIndex === -1 ? undefined : rankIndex + 1 };
  },
};
