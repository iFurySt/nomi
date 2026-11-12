// Authored portable examples, isolated from accounts and user documents.
import React from "react";
import { createRoot } from "react-dom/client";
import {
  bpeProgram,
  compactBpeProgram,
  waveProgram,
  temperatureProgram,
  parseInteractiveProgram,
} from "@nomi/core";
import { InteractiveBlock } from "../../packages/ui/src/canvas/InteractiveBlock";
import "../../packages/ui/src/styles.css";
import generatedBpe from "../../packages/core/src/interactive/fixtures/generated-bpe.json";
import generatedWave from "../../packages/core/src/interactive/fixtures/generated-wave.json";
import generatedSentence from "../../packages/core/src/interactive/fixtures/generated-bpe-sentence.json";
const programs = {
  compact: compactBpeProgram,
  generatedSentence,
  generatedBpe,
  generatedWave,
  bpe: bpeProgram,
  wave: waveProgram,
  temperature: temperatureProgram,
};
function EditableLab({ name }: { name: keyof typeof programs }) {
  const [program, setProgram] = React.useState(() =>
    parseInteractiveProgram(programs[name]),
  );
  return (
    <InteractiveBlock
      program={program}
      profile="fixture"
      documentId="v2"
      blockId={name}
      onApply={setProgram}
    />
  );
}
const root = createRoot(document.getElementById("root")!);
Object.assign(window, {
  labFixture: {
    show: (name: keyof typeof programs) => {
      root.render(
        <main style={{ padding: 24, maxWidth: 900, margin: "auto" }}>
          <EditableLab key={name} name={name} />
        </main>,
      );
    },
  },
});
(window as any).labFixture.show("bpe");
