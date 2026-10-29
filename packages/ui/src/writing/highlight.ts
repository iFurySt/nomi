import { common, createLowlight } from "lowlight";
const engine = createLowlight(common);
const plain = (source: string) => ({
  type: "root" as const,
  children: [{ type: "text" as const, value: source }],
});
export const codeHighlight = {
  listLanguages: () => engine.listLanguages(),
  registered: (language: string) => engine.registered(language),
  highlight: (language: string, source: string) =>
    source.length > 50000 || !engine.registered(language)
      ? plain(source)
      : engine.highlight(language, source),
  highlightAuto: (source: string) =>
    source.length > 50000 ? plain(source) : engine.highlightAuto(source),
};
