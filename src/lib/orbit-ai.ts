import { aiText } from "./tauri";

// ── Writing Assistant ─────────────────────────────────────────────────────────

export type WritingMode =
  | "improve"
  | "grammar"
  | "rephrase"
  | "formal"
  | "casual"
  | "expand"
  | "shorten"
  | "bullets"
  | "continue"
  | "email";

export interface WritingModeOption {
  mode: WritingMode;
  label: string;
  description: string;
}

export const WRITING_MODES: WritingModeOption[] = [
  { mode: "improve", label: "Improve", description: "Enhance clarity and quality" },
  { mode: "grammar", label: "Fix Grammar", description: "Correct errors and polish" },
  { mode: "rephrase", label: "Rephrase", description: "Say it a different way" },
  { mode: "formal", label: "Make Formal", description: "Professional & polished tone" },
  { mode: "casual", label: "Make Casual", description: "Friendly & conversational" },
  { mode: "expand", label: "Expand", description: "Add more detail and context" },
  { mode: "shorten", label: "Shorten", description: "Make it more concise" },
  { mode: "bullets", label: "Bullet Points", description: "Convert to a bullet list" },
  { mode: "continue", label: "Continue", description: "Keep writing in the same style" },
  { mode: "email", label: "Format as Email", description: "Reformat as a formal professional email" },
];

const WRITING_MODE_PROMPTS: Record<WritingMode, string> = {
  improve:
    "Improve the clarity, flow, and overall quality of the following text. Keep the original meaning and tone. Return only the improved text with no explanations.",
  grammar:
    "Fix all grammar, spelling, and punctuation errors in the following text. Keep the style and meaning intact. Return only the corrected text with no explanations.",
  rephrase:
    "Rephrase the following text to say the same thing in a different way. Preserve the meaning and intended audience. Return only the rephrased text with no explanations.",
  formal:
    "Rewrite the following text in a formal, professional tone suitable for business or academic contexts. Return only the rewritten text with no explanations.",
  casual:
    "Rewrite the following text in a friendly, conversational, and casual tone. Return only the rewritten text with no explanations.",
  expand:
    "Expand the following text with more detail, context, and supporting information while staying on topic. Return only the expanded text with no explanations.",
  shorten:
    "Shorten the following text significantly while preserving all key points and meaning. Remove filler and redundancy. Return only the shortened text with no explanations.",
  bullets:
    "Convert the following text into a clean, concise bullet-point list that captures all key ideas. Return only the bullet list with no explanations.",
  continue:
    "Continue writing the following text in the same style, tone, and voice. Add a natural continuation of roughly the same length. Return only the continuation (do not repeat the original) with no explanations.",
  email:
    "Reformat the following message into a complete, professionally structured email. Use a formal salutation (e.g. 'Dear [Recipient],' — if no recipient name is obvious, use 'Dear Sir/Madam,'), well-structured paragraphs with correct punctuation, and close with 'Kind regards,' followed by the sender name provided. Return only the formatted email with no explanations.",
};

export interface WritingResult {
  text: string | null;
  error: string | null;
}

export async function processWriting(
  text: string,
  mode: WritingMode,
): Promise<WritingResult> {
  const instruction = WRITING_MODE_PROMPTS[mode];
  const prompt = [instruction, "", "=== TEXT ===", text.trim()].join("\n");
  const maxTokens = mode === "expand" || mode === "continue" || mode === "email" ? 800 : 600;

  try {
    const result = await aiText(prompt, maxTokens);
    return { text: result, error: null };
  } catch (err) {
    return { text: null, error: String(err) };
  }
}

// ── Meeting Mode ──────────────────────────────────────────────────────────────

export interface MeetingNoteDraft {
  title: string;
  content: string;
}

export interface MeetingTaskDraft {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  subTasks: string[];
}

export interface MeetingArtifacts {
  note: MeetingNoteDraft;
  task: MeetingTaskDraft;
}

export interface MeetingArtifactsResult {
  artifacts: MeetingArtifacts | null;
  error: string | null;
}

export interface MeetingAgendaResult {
  agenda: string | null;
  error: string | null;
}

/** Maximum sub-tasks per meeting follow-up task to avoid overwhelming the task view. */
const MAX_MEETING_SUBTASKS = 6;

function stripMarkdownCodeFence(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) {
    const first = s.indexOf("\n");
    if (first !== -1) s = s.slice(first + 1);
  }
  if (s.endsWith("```")) {
    s = s.slice(0, s.lastIndexOf("```"));
  }
  return s.trim();
}

function fallbackMeetingArtifacts(title: string, notes: string[]): MeetingArtifacts {
  return {
    note: {
      title: `Meeting notes: ${title}`,
      content: notes.map((n, i) => `${i + 1}. ${n}`).join("\n"),
    },
    task: {
      title: `Follow up on: ${title}`,
      description: `Review action items from the "${title}" meeting.`,
      priority: "medium",
      subTasks: [],
    },
  };
}

function parseMeetingArtifacts(text: string): MeetingArtifacts | null {
  try {
    const parsed = JSON.parse(stripMarkdownCodeFence(text));
    const note = parsed.note;
    const task = parsed.task;
    if (!note?.title || !note?.content || !task?.title) return null;

    return {
      note: {
        title: String(note.title).trim(),
        content: String(note.content).trim(),
      },
      task: {
        title: String(task.title).trim(),
        description: String(task.description ?? "").trim(),
        priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
        subTasks: Array.isArray(task.subTasks)
          ? (task.subTasks as unknown[]).reduce((acc: string[], s: unknown) => {
              if (typeof s === "string" && s.trim() && acc.length < MAX_MEETING_SUBTASKS) {
                acc.push(s.trim());
              }
              return acc;
            }, [])
          : [],
      },
    };
  } catch {
    return null;
  }
}

export async function generateMeetingArtifacts(
  title: string,
  notes: string[],
): Promise<MeetingArtifactsResult> {
  const cleanedNotes = notes.map((n) => n.trim()).filter(Boolean);
  if (cleanedNotes.length === 0) {
    return { artifacts: null, error: "Add at least one meeting note before ending." };
  }

  const fallback = fallbackMeetingArtifacts(title, cleanedNotes);

  const prompt = [
    "You are Luna inside Starfield. Convert these raw meeting notes into one polished note and one actionable follow-up task.",
    "Respond with raw JSON only. No markdown fences. No commentary.",
    "",
    '{"note":{"title":"string","content":"string"},"task":{"title":"string","description":"string","priority":"low|medium|high","subTasks":["string"]}}',
    "",
    "Rules for the note:",
    "- Title should be concise and specific to the meeting.",
    "- Content must be markdown.",
    "- Prefer a clean structure: Summary, Decisions, Risks, Action Items.",
    "- Stay faithful to the notes. Do not invent facts.",
    "",
    "Rules for the task:",
    "- Create exactly one task representing the most important next step.",
    "- Use an action-oriented title starting with a verb.",
    "- description should give enough context for someone reopening the task later.",
    "- subTasks should capture concrete follow-up items when they exist.",
    "",
    `Meeting title: ${title.trim() || "Meeting"}`,
    "Meeting notes:",
    ...cleanedNotes.map((n, i) => `${i + 1}. ${n}`),
  ].join("\n");

  try {
    const result = await aiText(prompt, 700);
    const artifacts = parseMeetingArtifacts(result);
    if (!artifacts) {
      return {
        artifacts: fallback,
        error: "Luna returned an invalid meeting payload. Used a structured fallback.",
      };
    }
    return { artifacts, error: null };
  } catch (err) {
    return { artifacts: null, error: String(err) };
  }
}

export async function generateMeetingAgenda(title: string): Promise<MeetingAgendaResult> {
  const prompt = [
    "You are a meeting facilitator. Generate a concise, structured meeting agenda.",
    "Respond with markdown only — no JSON, no preamble, no sign-off.",
    "",
    "Rules:",
    "- Use a short intro line, then a numbered list of 3-6 agenda items.",
    "- Each item should be short (one line) and actionable.",
    "- End with a single line: 'Action items & next steps'.",
    "- Do NOT add a title heading.",
    "- Keep the total response under 200 words.",
    "",
    `Meeting title: ${title}`,
  ].join("\n");

  try {
    const result = await aiText(prompt, 300);
    return { agenda: result.trim(), error: null };
  } catch (err) {
    return { agenda: null, error: String(err) };
  }
}
