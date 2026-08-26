import { z } from "zod";

export const skillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  requires: z.array(z.string()).default([]),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

export interface Skill extends SkillFrontmatter {
  // Raw markdown after the frontmatter — the "full instructions" a
  // progressive-disclosure strategy loads only once a skill is selected.
  body: string;
}
