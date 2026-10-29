import { BlockMath } from "@tiptap/extension-mathematics";
import { readMathSource } from "./mathSource";

export const WritingBlockMath = BlockMath.extend({
  addNodeView() {
    const render = this.parent!()!;
    return (props) => {
      const view = render(props);
      if (view.dom instanceof HTMLElement)
        view.dom.dataset.mathAlign = readMathSource(
          props.node.attrs.latex,
        ).alignment;
      return view;
    };
  },
});
