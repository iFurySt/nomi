import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { codeHighlight } from "./highlight";
import { CodeToolbar, CodeGutter } from "./CodeToolbar";
import { codeFence, codeInfo, parseCodeInfo } from "./codeMetadata";
function EditableCode({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper
      className="writing-code-block"
      data-wrap={node.attrs.wrap || undefined}
    >
      <CodeToolbar
        source={node.textContent}
        language={node.attrs.language}
        caption={node.attrs.caption}
        wrap={node.attrs.wrap}
        collapsed={node.attrs.collapsed}
        onChange={updateAttributes}
      />
      <div className="code-scroll" hidden={node.attrs.collapsed}>
        <div className="code-body">
          <CodeGutter source={node.textContent} />
          <pre>
            <NodeViewContent<"code">
              as="code"
              style={{ whiteSpace: node.attrs.wrap ? "pre-wrap" : "pre" }}
              className={
                node.attrs.language
                  ? `language-${node.attrs.language}`
                  : undefined
              }
            />
          </pre>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
export const WritingCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    const defaults = {
      caption: "",
      wrap: false,
      collapsed: false,
      codeMetadata: {},
      codeExtra: "",
    };
    return {
      ...this.parent?.(),
      ...Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
          key,
          {
            default: value,
            rendered: false,
            parseHTML: (element: HTMLElement) =>
              parseCodeInfo(element.getAttribute("data-code-info") ?? "")[
                key as keyof typeof defaults
              ],
          },
        ]),
      ),
    };
  },
  renderHTML({ node }) {
    return [
      "pre",
      { "data-code-info": codeInfo(node.attrs) },
      [
        "code",
        {
          class: node.attrs.language ? `language-${node.attrs.language}` : null,
        },
        0,
      ],
    ];
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode(
      "codeBlock",
      parseCodeInfo(token.lang || ""),
      token.text ? [helpers.createTextNode(token.text)] : [],
    ),
  renderMarkdown: (node) =>
    codeFence(
      node.attrs ?? {},
      (node.content ?? []).map((child) => child.text ?? "").join(""),
    ),
  addNodeView() {
    return ReactNodeViewRenderer(EditableCode);
  },
}).configure({ lowlight: codeHighlight });
