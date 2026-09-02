import type { ReactNode } from "react";

const INLINE_TOKEN = /(https?:\/\/[^\s]+|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;

function trimUrl(value: string) {
  const trailing = value.match(/[),.!?;:]+$/)?.[0] ?? "";
  return {
    href: value.slice(0, value.length - trailing.length),
    trailing,
  };
}

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(INLINE_TOKEN)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(value.slice(lastIndex, index));
    }

    if (token.startsWith("http://") || token.startsWith("https://")) {
      const { href, trailing } = trimUrl(token);
      parts.push(
        <a
          key={`${keyPrefix}-${index}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-all font-semibold underline decoration-current/50 underline-offset-2 hover:decoration-current"
        >
          {href}
        </a>
      );
      if (trailing) parts.push(trailing);
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-${index}`} className="font-bold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <strong key={`${keyPrefix}-${index}`} className="font-bold">
          {token.slice(1, -1)}
        </strong>
      );
    } else if (token.startsWith("_")) {
      parts.push(
        <em key={`${keyPrefix}-${index}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("~")) {
      parts.push(
        <del key={`${keyPrefix}-${index}`}>
          {token.slice(1, -1)}
        </del>
      );
    } else {
      parts.push(
        <code
          key={`${keyPrefix}-${index}`}
          className="rounded bg-black/15 px-1 py-0.5 font-data text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  return parts;
}

export function WhatsappMessageText({ body }: { body: string }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {body.split("\n").map((line, index) => (
        <span key={`line-${index}`}>
          {index > 0 ? <br /> : null}
          {renderInline(line, `line-${index}`)}
        </span>
      ))}
    </span>
  );
}
