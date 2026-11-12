/** Portable, JSON-only interactive content. No React, DOM, Node or executable source. */
export type Value =
  null | boolean | number | string | Value[] | { [key: string]: Value };
export type StudyState = Record<string, Value>;
export type Expression =
  | { kind: "literal"; value: Value }
  | { kind: "state" | "variable" | "derived"; id: string }
  | { kind: "call"; function: string; version: number; args: Expression[] }
  | { kind: "match"; value: Expression; cases: Record<string, Expression> }
  | { kind: "object"; fields: Record<string, Expression> }
  | { kind: "map"; variable: string; items: Expression; body: Expression }
  | {
      kind: "sampleFamily";
      seriesVariable: string;
      seriesValues: number[];
      sampleVariable: string;
      domain: [number, number];
      count: number;
      value: Expression;
    };
export interface StateDefinition {
  type: "number" | "enum" | "vector" | "string";
  default: Value;
  scope: "user";
  min?: number;
  max?: number;
  step?: number;
  values?: string[];
  itemType?: "number";
  length?: number;
  maxLength?: number;
}
export const interactiveComponents = [
  "Panel",
  "Row",
  "Text",
  "Button",
  "SegmentedControl",
  "Slider",
  "Math",
  "Plot",
  "TextInput",
  "Table",
  "Metric",
  "Scene",
] as const;
export type InteractiveComponent = (typeof interactiveComponents)[number];
export interface InteractiveNode {
  id: string;
  component: InteractiveComponent;
  version: 1 | 2;
  props: Record<string, unknown>;
  bind?: { value: string };
  on?: { activate: string };
}
export interface InteractiveProgram {
  schema: "nomi-interactive-ir/draft-1" | "nomi-interactive-ir/draft-2";
  id: string;
  version: number;
  profile: "portable.learning/draft-1" | "portable.learning/draft-2";
  requires: {
    components: Record<string, number>;
    functions: Record<string, number>;
    expressions: string[];
    hostEffects: [];
  };
  budget: {
    maxSamplePointsPerSeries: number;
    maxSeries: number;
    maxStepsPerEvaluation: number;
  };
  state: Record<string, StateDefinition>;
  derived: Record<string, Expression>;
  actions: Record<
    string,
    | { kind: "reset"; scope: "user"; targets: string[] }
    | { kind: "set"; scope: "user"; target: string; value: Expression }
  >;
  root: string;
  nodes: InteractiveNode[];
}
export class InteractiveError extends Error {
  constructor(
    public code:
      | "schema"
      | "capability"
      | "reference"
      | "cycle"
      | "domain"
      | "state"
      | "budget",
    message: string,
  ) {
    super(message);
    this.name = "InteractiveError";
  }
}
