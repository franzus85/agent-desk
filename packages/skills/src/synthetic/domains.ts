export interface DomainSpec {
  id: string;
  displayName: string;
  objects: string[];
}

// 12 domains x 3 objects x 4 verbs (generate.ts) = 144 synthetic skills —
// plausible enterprise-SaaS domains, chosen so names collide across
// domains on purpose (every domain gets a "search", most share CRUD-ish
// verbs) rather than hoping random content happens to be confusable.
export const domains: DomainSpec[] = [
  { id: "crm", displayName: "CRM", objects: ["contact", "deal", "account"] },
  { id: "expenses", displayName: "Expense Management", objects: ["expense", "receipt", "budget"] },
  { id: "hr", displayName: "HR", objects: ["employee", "leave request", "timesheet"] },
  { id: "devops", displayName: "DevOps", objects: ["pipeline", "deployment", "incident"] },
  { id: "project", displayName: "Project Management", objects: ["task", "sprint", "milestone"] },
  { id: "scheduling", displayName: "Scheduling", objects: ["meeting", "room booking", "reminder"] },
  { id: "kb", displayName: "Knowledge Base", objects: ["article", "faq", "policy"] },
  { id: "email", displayName: "Email", objects: ["message", "draft", "label"] },
  { id: "files", displayName: "File Storage", objects: ["document", "folder", "share link"] },
  { id: "analytics", displayName: "Analytics", objects: ["dashboard", "metric", "alert"] },
  { id: "support", displayName: "Support", objects: ["ticket", "customer", "macro"] },
  { id: "procurement", displayName: "Procurement", objects: ["purchase order", "vendor", "invoice"] },
];
