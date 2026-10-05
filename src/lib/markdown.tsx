import { Fragment, type ReactNode } from "react";

/**
 * Markdown básico para descripciones: párrafos, títulos (#, ##, ###), listas (- * 1.), **negrita** y *cursiva*.
 * Produce elementos React (que escapan todo): no hay HTML crudo ni enlaces, así que no se puede inyectar código.
 */
const LIST = /^\s*([-*]|\d+[.)])\s+/;
const HEADING = /^(#{1,3})\s+(.*)$/;

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const h = HEADING.exec(line);
    if (!line.trim()) i++;
    else if (h) {
      const Tag = h[1]!.length === 1 ? "h3" : "h4";
      blocks.push(<Tag key={i}>{inline(h[2]!)}</Tag>);
      i++;
    } else if (LIST.test(line)) {
      const ordered = /\d/.test(LIST.exec(line)![1]!);
      const items: ReactNode[] = [];
      for (; i < lines.length && LIST.test(lines[i]!); i++) items.push(<li key={i}>{inline(lines[i]!.replace(LIST, ""))}</li>);
      blocks.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i]!.trim() && !LIST.test(lines[i]!) && !HEADING.test(lines[i]!); i++) para.push(lines[i]!);
      blocks.push(
        <p key={i}>
          {para.map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>,
      );
    }
  }
  return <>{blocks}</>;
}

function inline(s: string): ReactNode[] {
  return s
    .split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/)
    .filter(Boolean)
    .map((part, k) =>
      /^\*\*.+\*\*$/.test(part) ? (
        <strong key={k}>{part.slice(2, -2)}</strong>
      ) : /^([*_]).+\1$/.test(part) ? (
        <em key={k}>{part.slice(1, -1)}</em>
      ) : (
        part
      ),
    );
}
