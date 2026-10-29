export * from "./types";
export * from "./runtime";
export * from "./validate";
import definition from "./temperature.json";
import { parseInteractiveProgram } from "./validate";
export const temperatureProgram = parseInteractiveProgram(definition);
