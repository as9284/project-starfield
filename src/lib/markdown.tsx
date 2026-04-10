import type { ReactNode } from "react";

/**
 * Renders a markdown-like string into an array of React elements.
 * Supports: # headings, **bold**, *italic*, ~~strikethrough~~,
 * bullet lists (- ), numbered lists (1. ), and line breaks.
 */
export function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split("\n");
  const result: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  function flushList() {
    if (listType === "ul") {
      result.push(
        <ul key={key++} className="list-disc list-inside space-y-0.5">
          {listItems}
        </ul>,
      );
    } else if (listType === "ol") {
      result.push(
        <ol key={key++} className="list-decimal list-inside space-y-0.5">
          {listItems}
        </ol>,
      );
    }
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    const olMatch = line.match(/^\d+\.\s+(.*)/);

    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const content = inlineFormat(headingMatch[2]);
      if (level === 1) {
        result.push(
          <h1
            key={key++}
            className="mt-1 text-xl font-semibold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            {content}
          </h1>,
        );
      } else if (level === 2) {
        result.push(
          <h2
            key={key++}
            className="mt-1 text-lg font-semibold"
            style={{ color: "var(--color-text-primary)", opacity: 0.95 }}
          >
            {content}
          </h2>,
        );
      } else {
        result.push(
          <h3
            key={key++}
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--color-text-primary)", opacity: 0.9 }}
          >
            {content}
          </h3>,
        );
      }
    } else if (ulMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(<li key={key++}>{inlineFormat(ulMatch[1])}</li>);
    } else if (olMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(<li key={key++}>{inlineFormat(olMatch[1])}</li>);
    } else {
      flushList();
      if (line.trim() === "") {
        result.push(<br key={key++} />);
      } else {
        result.push(<p key={key++}>{inlineFormat(line)}</p>);
      }
    }
  }

  flushList();
  return result;
}

function inlineFormat(text: string): ReactNode {
  const regex = /(\*\*(.+?)\*\*|~~(.+?)~~|\*(.+?)\*)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(
        <strong
          key={k++}
          className="font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      parts.push(
        <del key={k++} style={{ color: "var(--color-text-secondary)" }}>
          {match[3]}
        </del>,
      );
    } else if (match[4]) {
      parts.push(<em key={k++}>{match[4]}</em>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}

/**
 * Strips markdown syntax and returns plain text,
 * suitable for compact card previews where inline formatting is not needed.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}
