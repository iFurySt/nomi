import { CodeToolbar, CodeGutter } from "./CodeToolbar";
import { parseCodeInfo } from "./codeMetadata";
import {
  Children,
  isValidElement,
  useMemo,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { codeHighlight } from "./highlight";
type HighlightNode = {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HighlightNode[];
};
function tokens(nodes: HighlightNode[]): ReactNode[] {
  return nodes.map((node, index) =>
    node.type === "text" ? (
      node.value
    ) : (
      <span
        key={index}
        className={
          Array.isArray(node.properties?.className)
            ? node.properties.className.join(" ")
            : undefined
        }
      >
        {tokens(node.children ?? [])}
      </span>
    ),
  );
}
export function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  const props = isValidElement<{
    children?: ReactNode;
    className?: string;
    "data-code-info"?: string;
  }>(child)
    ? child.props
    : undefined;
  const source = String(props?.children ?? "").replace(/\n$/, "");
  const language = props?.className?.match(/language-([^\s]+)/)?.[1];
  const initial = parseCodeInfo(props?.["data-code-info"] ?? language ?? "");
  const [settings, setSettings] = useState(initial);
  useEffect(() => setSettings(initial), [props?.["data-code-info"], language]);
  const highlighted = useMemo(
    () =>
      settings.language
        ? codeHighlight.highlight(settings.language, source)
        : codeHighlight.highlightAuto(source),
    [settings.language, source],
  );
  return (
    <div className="writing-code-block" data-wrap={settings.wrap || undefined}>
      <CodeToolbar
        source={source}
        readOnlyCaption
        {...settings}
        onChange={(attrs) => setSettings((old) => ({ ...old, ...attrs }))}
      />
      <div className="code-scroll" hidden={settings.collapsed}>
        <div className="code-body">
          <CodeGutter source={source} />
          <pre>
            <code className={props?.className}>
              {tokens(highlighted.children)}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
