import {
  parseInteractiveProgram,
  hydrateStudyState,
  type InteractiveProgram,
  type StudyState,
} from "@nomi/core";
import type { StoragePort } from "./storage";
// Browser / Electron-profile local scope, not a server identity or access grant.
export function learningStorageKeys(profile: string, programId: string) {
  return {
    definition: `nomi.learning.definition.v1:${JSON.stringify([profile])}`,
    state: `nomi.learning.state.v1:${JSON.stringify([profile, programId])}`,
  };
}
export function readLearningDefinition(
  storage: StoragePort,
  profile: string,
  fallback: InteractiveProgram,
) {
  let raw: string | null = null;
  try {
    raw = storage.getItem(learningStorageKeys(profile, fallback.id).definition);
    return {
      program: raw === null ? fallback : parseInteractiveProgram(raw),
      raw: raw ?? JSON.stringify(fallback, null, 2),
      error: "",
    };
  } catch {
    return {
      program: fallback,
      raw: raw ?? JSON.stringify(fallback, null, 2),
      error: "保存的交互定义暂时无法读取，原内容已保留。请编辑修复后应用。",
    };
  }
}
export function readLearningState(
  storage: StoragePort,
  profile: string,
  program: InteractiveProgram,
) {
  try {
    const raw = storage.getItem(learningStorageKeys(profile, program.id).state);
    const saved = raw === null ? undefined : JSON.parse(raw);
    if (
      saved !== undefined &&
      (!saved || typeof saved !== "object" || Array.isArray(saved))
    )
      throw Error("Invalid progress");
    return { state: hydrateStudyState(program, saved), error: "" };
  } catch {
    return {
      state: hydrateStudyState(program),
      error:
        "保存的学习进度暂时无法读取，原内容已保留。当前更改暂不保存；Reset 可恢复默认进度。",
    };
  }
}
export function saveLearningState(
  storage: StoragePort,
  profile: string,
  program: InteractiveProgram,
  state: StudyState,
) {
  try {
    storage.setItem(
      learningStorageKeys(profile, program.id).state,
      JSON.stringify(hydrateStudyState(program, state)),
    );
    return "";
  } catch {
    return "进度未能保存到本机，请重试保存并暂时保留当前页面。";
  }
}
export function saveLearningDefinition(
  storage: StoragePort,
  profile: string,
  program: InteractiveProgram,
) {
  try {
    storage.setItem(
      learningStorageKeys(profile, program.id).definition,
      JSON.stringify(program),
    );
    return "";
  } catch {
    return "定义未能保存，原有定义保持不变。";
  }
}
