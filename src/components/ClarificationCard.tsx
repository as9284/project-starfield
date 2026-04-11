import { useState } from "react";
import { motion } from "framer-motion";
import { Check, HelpCircle, Send } from "lucide-react";
import type { ClarificationQuestion } from "../lib/luna-prompt";

interface Props {
  questions: ClarificationQuestion[];
  disabled?: boolean;
  onSubmit: (answers: Record<string, string>) => void;
}

export function ClarificationCard({
  questions,
  disabled = false,
  onSubmit,
}: Props) {
  const [selectedChoices, setSelectedChoices] = useState<
    Record<string, string>
  >({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function getAnswer(id: string): string {
    return selectedChoices[id] || freeTexts[id] || "";
  }

  const answeredCount = questions.filter((q) => getAnswer(q.id).trim()).length;
  const canSubmit =
    answeredCount === questions.length && !submitted && !disabled;

  function handleChoice(id: string, value: string) {
    if (submitted || disabled) return;
    setSelectedChoices((prev) => ({ ...prev, [id]: value }));
    setFreeTexts((prev) => ({ ...prev, [id]: "" }));
  }

  function handleText(id: string, value: string) {
    if (submitted || disabled) return;
    setFreeTexts((prev) => ({ ...prev, [id]: value }));
    if (value.trim()) {
      setSelectedChoices((prev) => ({ ...prev, [id]: "" }));
    }
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitted(true);
    const answers: Record<string, string> = {};
    for (const q of questions) {
      answers[q.id] = getAnswer(q.id);
    }
    onSubmit(answers);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="luna-clue-card"
    >
      {/* Header */}
      <div className="luna-clue-header">
        <div className="luna-clue-icon">
          <HelpCircle size={14} />
        </div>
        <div className="luna-clue-header-text">
          <p className="luna-clue-title">
            {questions.length > 1
              ? "Clarifications needed"
              : "Clarification needed"}
          </p>
          {questions.length > 1 && (
            <p className="luna-clue-subtitle">
              {submitted
                ? "All responses submitted"
                : `${answeredCount} of ${questions.length} answered`}
            </p>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="luna-clue-body">
        {questions.map((q) => {
          const answer = getAnswer(q.id);
          return (
            <div key={q.id} className="luna-clue-question">
              <p className="luna-clue-question-text">{q.question}</p>

              {q.choices.length > 0 && (
                <div className="luna-clue-choices">
                  {q.choices.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      disabled={disabled || submitted}
                      onClick={() => handleChoice(q.id, c.value)}
                      className={`luna-clue-choice${answer === c.value ? " luna-clue-choice-active" : ""}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}

              {q.allowFreeText && !submitted && (
                <textarea
                  value={freeTexts[q.id] ?? ""}
                  onChange={(e) => handleText(q.id, e.target.value)}
                  disabled={disabled || submitted}
                  placeholder={
                    q.choices.length > 0
                      ? "Or type a custom answer…"
                      : "Type your answer…"
                  }
                  rows={1}
                  className="luna-clue-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (canSubmit) handleSubmit();
                    }
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div className="luna-clue-footer">
          {submitted ? (
            <span className="luna-clue-sent">
              <Check size={11} />
              Responses sent
            </span>
          ) : (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className={`luna-clue-submit${canSubmit ? " luna-clue-submit-ready" : ""}`}
            >
              <Send size={12} />
              {questions.length > 1 ? "Submit all" : "Submit"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
