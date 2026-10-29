import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { codeHighlight } from "./highlight";
import { CodeCopy } from "./CodeContent";
function EditableCode({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper className="writing-code-block">
      <CodeCopy source={node.textContent} />
      <pre>
        <NodeViewContent<"code">
          as="code"
          style={{whiteSpace: "pre"}}
          className={
            node.attrs.language ? `language-${node.attrs.language}` : undefined
          }
        />
      </pre>
    </NodeViewWrapper>
  );
}
export const WritingCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EditableCode);
  },
}).configure({ lowlight: codeHighlight });
