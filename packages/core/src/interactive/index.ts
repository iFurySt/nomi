export * from "./types";
export * from "./runtime";
export * from "./validate";
import definition from "./temperature.json";
import { parseInteractiveProgram } from "./validate";
export const temperatureProgram = parseInteractiveProgram(definition);

import bpeDefinition from "./bpe.json";
import waveDefinition from "./wave.json";
export const bpeProgram = parseInteractiveProgram(bpeDefinition);
export const waveProgram = parseInteractiveProgram(waveDefinition);

import compactDefinition from "./bpe-compact.json";
export const compactBpeProgram = parseInteractiveProgram(compactDefinition);
