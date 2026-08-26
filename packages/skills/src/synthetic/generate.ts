import { stringify as stringifyYaml } from "yaml";
import { domains as defaultDomains, type DomainSpec } from "./domains.js";

export interface SyntheticSkillSpec {
  name: string;
  description: string;
  requires: string[];
  body: string;
}

interface VerbSpec {
  id: string;
  describe: (object: string) => string;
}

const VERBS: VerbSpec[] = [
  { id: "search", describe: (object) => `Searches ${pluralize(object)} by keyword.` },
  { id: "list", describe: (object) => `Lists all ${pluralize(object)}.` },
  { id: "get", describe: (object) => `Fetches a single ${object} by id.` },
  { id: "create", describe: (object) => `Creates a new ${object}.` },
];

function slug(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "_");
}

function pluralize(text: string): string {
  if (text.endsWith("y") && !/[aeiou]y$/.test(text)) {
    return `${text.slice(0, -1)}ies`;
  }
  return text.endsWith("s") ? text : `${text}s`;
}

export function generateSyntheticSkills(specs: DomainSpec[] = defaultDomains): SyntheticSkillSpec[] {
  const skills: SyntheticSkillSpec[] = [];
  for (const domain of specs) {
    for (const object of domain.objects) {
      for (const verb of VERBS) {
        const name = `${domain.id}.${verb.id}_${slug(object)}`;
        skills.push({
          name,
          description: `${verb.describe(object)} (${domain.displayName})`,
          requires: [name],
          body: `## Steps\n1. Call \`${name}\` with the relevant query.\n\n## Verify before finishing\n- The result matches what the user asked for.`,
        });
      }
    }
  }
  return skills;
}

export function toMarkdown(spec: SyntheticSkillSpec): string {
  const frontmatter = stringifyYaml({
    name: spec.name,
    description: spec.description,
    requires: spec.requires,
  });
  return `---\n${frontmatter}---\n\n${spec.body}\n`;
}
