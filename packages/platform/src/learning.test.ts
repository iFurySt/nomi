import { describe, it, expect } from "vitest";
import { temperatureProgram, hydrateStudyState } from "@nomi/core";
import {
  learningStorageKeys,
  readLearningDefinition,
  readLearningState,
  saveLearningDefinition,
  saveLearningState,
} from "./learning";
import type { StoragePort } from "./storage";
const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
describe("learning local persistence", () => {
  it("separates authoring from personal progress and profile/program namespaces", () => {
    const store = memory(),
      program = temperatureProgram;
    const state = hydrateStudyState(program, {
      temperature: 2,
      mode: "temperature",
    });
    expect(saveLearningState(store, "one", program, state)).toBe("");
    expect(readLearningState(store, "one", program).state).toEqual(state);
    expect(readLearningState(store, "two", program).state.temperature).toBe(
      0.85,
    );
    expect(
      readLearningState(store, "one", { ...program, id: "another" }).state
        .temperature,
    ).toBe(0.85);
    expect(saveLearningDefinition(store, "one", program)).toBe("");
    expect(
      JSON.parse(
        store.values.get(learningStorageKeys("one", program.id).definition)!,
      ),
    ).not.toHaveProperty("temperature", 2);
    expect(
      readLearningDefinition(store, "one", program).program.state.temperature
        .default,
    ).toBe(0.85);
  });
  it("preserves corrupt definitions and progress until an explicit repair", () => {
    const store = memory(),
      keys = learningStorageKeys("one", temperatureProgram.id);
    store.values.set(keys.definition, "{broken");
    store.values.set(keys.state, "[broken");
    expect(
      readLearningDefinition(store, "one", temperatureProgram).error,
    ).toBeTruthy();
    expect(readLearningDefinition(store, "one", temperatureProgram).raw).toBe(
      "{broken",
    );
    expect(
      readLearningState(store, "one", temperatureProgram).error,
    ).toBeTruthy();
    expect(store.values.get(keys.state)).toBe("[broken");
  });
  it("reports unavailable storage without a false saved status", () => {
    const unavailable: StoragePort = {
      getItem: () => {
        throw Error("unavailable");
      },
      setItem: () => {
        throw Error("quota");
      },
      removeItem: () => {},
    };
    expect(
      readLearningState(unavailable, "one", temperatureProgram).error,
    ).toBeTruthy();
    expect(
      readLearningDefinition(unavailable, "one", temperatureProgram).error,
    ).toBeTruthy();
    expect(
      saveLearningState(
        unavailable,
        "one",
        temperatureProgram,
        hydrateStudyState(temperatureProgram),
      ),
    ).toBeTruthy();
    expect(
      saveLearningDefinition(unavailable, "one", temperatureProgram),
    ).toBeTruthy();
  });
});
