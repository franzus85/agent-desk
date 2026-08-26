import { z } from "zod";

export const selectionTaskSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedTool: z.string(),
  difficulty: z.enum(["easy", "hard"]),
});

export type SelectionTask = z.infer<typeof selectionTaskSchema>;

// 24 hand-curated tasks, all using the "search" verb (the most collision-prone
// verb — 36 tools share it identically across domains). Split evenly:
// "easy" tasks name the object noun directly, "hard" tasks paraphrase it.
// This lets later strategies be compared on whether they degrade specifically
// on the hard half.
export const selectionTasks: SelectionTask[] = [
  { id: "crm-easy", prompt: "Find the contact named Jane Doe.", expectedTool: "crm.search_contact", difficulty: "easy" },
  { id: "crm-hard", prompt: "What's the status of the Acme opportunity?", expectedTool: "crm.search_deal", difficulty: "hard" },

  { id: "expenses-easy", prompt: "Search my expenses from last week.", expectedTool: "expenses.search_expense", difficulty: "easy" },
  { id: "expenses-hard", prompt: "Find the proof of purchase for the flight I took.", expectedTool: "expenses.search_receipt", difficulty: "hard" },

  { id: "hr-easy", prompt: "Look up the employee record for Sam Lee.", expectedTool: "hr.search_employee", difficulty: "easy" },
  { id: "hr-hard", prompt: "Check the status of my time-off request.", expectedTool: "hr.search_leave_request", difficulty: "hard" },

  { id: "devops-easy", prompt: "Search incidents from this morning.", expectedTool: "devops.search_incident", difficulty: "easy" },
  { id: "devops-hard", prompt: "Find the last release to production.", expectedTool: "devops.search_deployment", difficulty: "hard" },

  { id: "project-easy", prompt: "Search tasks assigned to me.", expectedTool: "project.search_task", difficulty: "easy" },
  { id: "project-hard", prompt: "What iteration are we currently in?", expectedTool: "project.search_sprint", difficulty: "hard" },

  { id: "scheduling-easy", prompt: "Find my meeting with the design team.", expectedTool: "scheduling.search_meeting", difficulty: "easy" },
  { id: "scheduling-hard", prompt: "Is there a conference room reserved for 3pm?", expectedTool: "scheduling.search_room_booking", difficulty: "hard" },

  { id: "kb-easy", prompt: "Search articles about onboarding.", expectedTool: "kb.search_article", difficulty: "easy" },
  { id: "kb-hard", prompt: "What's the guideline on expense limits?", expectedTool: "kb.search_policy", difficulty: "hard" },

  { id: "email-easy", prompt: "Search messages from my manager.", expectedTool: "email.search_message", difficulty: "easy" },
  { id: "email-hard", prompt: "Find everything tagged as urgent.", expectedTool: "email.search_label", difficulty: "hard" },

  { id: "files-easy", prompt: "Search documents about the Q3 roadmap.", expectedTool: "files.search_document", difficulty: "easy" },
  { id: "files-hard", prompt: "Find the directory for the marketing assets.", expectedTool: "files.search_folder", difficulty: "hard" },

  { id: "analytics-easy", prompt: "Search dashboards for revenue.", expectedTool: "analytics.search_dashboard", difficulty: "easy" },
  { id: "analytics-hard", prompt: "Find the KPI for customer churn.", expectedTool: "analytics.search_metric", difficulty: "hard" },

  { id: "support-easy", prompt: "Search tickets about login issues.", expectedTool: "support.search_ticket", difficulty: "easy" },
  { id: "support-hard", prompt: "Find the end user who reported the outage.", expectedTool: "support.search_customer", difficulty: "hard" },

  { id: "procurement-easy", prompt: "Search vendors for office supplies.", expectedTool: "procurement.search_vendor", difficulty: "easy" },
  { id: "procurement-hard", prompt: "Find the bill from last month's supplier order.", expectedTool: "procurement.search_invoice", difficulty: "hard" },
];
