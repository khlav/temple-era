import { describe, it, expect } from "vitest";
import { extractCharacterLines } from "../aa-template";

describe("extractCharacterLines", () => {
  it("returns lines containing {assign:SlotName}", () => {
    const template = "Line 1\n{skull} Tank: {assign:MainTank}\nLine 3";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "{skull} Tank: {assign:MainTank}",
    ]);
  });

  it("returns lines containing {ref:SlotName}", () => {
    const template =
      "{assign:MainTank} Rend\nRef line: {ref:MainTank}\nOther line";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "{assign:MainTank} Rend",
      "Ref line: {ref:MainTank}",
    ]);
  });

  it("matches case-insensitively", () => {
    const template = "Tank: {assign:MAINTANK}";
    expect(extractCharacterLines(template, ["maintank"])).toEqual([
      "Tank: {assign:MAINTANK}",
    ]);
  });

  it("matches slots with modifiers like {assign:SlotName:4}", () => {
    const template = "Tank: {assign:MainTank:4:nocolor}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "Tank: {assign:MainTank:4:nocolor}",
    ]);
  });

  it("matches slots with ref modifier {ref:SlotName:nocolor}", () => {
    const template = "Ref: {ref:MainTank:nocolor}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "Ref: {ref:MainTank:nocolor}",
    ]);
  });

  it("returns empty array when template is empty", () => {
    expect(extractCharacterLines("", ["MainTank"])).toEqual([]);
  });

  it("returns empty array when slotNames is empty", () => {
    expect(extractCharacterLines("Tank: {assign:MainTank}", [])).toEqual([]);
  });

  it("only returns lines containing the specified slots", () => {
    const template = "MT: {assign:MainTank}\nOT: {assign:OffTank}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "MT: {assign:MainTank}",
    ]);
  });

  it("returns a line containing any of multiple specified slots", () => {
    const template =
      "{assign:MainTank} and {assign:OffTank} on same line\nUnrelated line";
    expect(extractCharacterLines(template, ["MainTank", "OffTank"])).toEqual([
      "{assign:MainTank} and {assign:OffTank} on same line",
    ]);
  });

  it("does not return lines with similar but non-matching slot names", () => {
    const template = "MT: {assign:MainTankBackup}\nOT: {assign:MainTank}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "OT: {assign:MainTank}",
    ]);
  });

  it("includes {assign:} definition lines for slots referenced via {ref:} in matched lines", () => {
    // Healer line references the tank slot — renderer needs the tank definition line too
    const template =
      "{skull} Tank: {assign:HatefulTank1}\n{cross} {ref:HatefulTank1}: {assign:HatefulTank1Heals}\nUnrelated line";
    expect(extractCharacterLines(template, ["HatefulTank1Heals"])).toEqual([
      "{skull} Tank: {assign:HatefulTank1}",
      "{cross} {ref:HatefulTank1}: {assign:HatefulTank1Heals}",
    ]);
  });
});
