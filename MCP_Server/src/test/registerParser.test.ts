import { describe, it, expect } from "vitest";
import {
  registersToFloat,
  parseEnergyRegisters,
} from "../utils/registerParser";

/**
 * Helper: encode a JS number into its two big-endian 16-bit register words,
 * mirroring how a Modbus device would transmit an IEEE-754 float across two
 * holding registers.
 */
function floatToRegisters(value: number): [number, number] {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value, 0);
  return [buffer.readUInt16BE(0), buffer.readUInt16BE(2)];
}

describe("registersToFloat", () => {
  it("reconstructs a positive float from two register words", () => {
    const [high, low] = floatToRegisters(230.5);
    expect(registersToFloat(high, low)).toBeCloseTo(230.5, 4);
  });

  it("reconstructs a small non-zero float exactly (no rounding away)", () => {
    const [high, low] = floatToRegisters(0.0001);
    expect(registersToFloat(high, low)).toBeCloseTo(0.0001, 7);
  });

  it("reconstructs zero", () => {
    const [high, low] = floatToRegisters(0);
    expect(registersToFloat(high, low)).toBe(0);
  });

  it("reconstructs negative values", () => {
    const [high, low] = floatToRegisters(-12.75);
    expect(registersToFloat(high, low)).toBeCloseTo(-12.75, 4);
  });
});

describe("parseEnergyRegisters", () => {
  it("parses voltage, current and power from 6 registers", () => {
    const registers = [
      ...floatToRegisters(230.12),
      ...floatToRegisters(5.5),
      ...floatToRegisters(1.25),
    ];

    const result = parseEnergyRegisters(registers);

    expect(result).toEqual({
      voltage: "230.12",
      current: "5.50",
      power: "1.25",
    });
  });

  it("formats every field to exactly two decimal places", () => {
    const registers = [
      ...floatToRegisters(1),
      ...floatToRegisters(2),
      ...floatToRegisters(3),
    ];

    const result = parseEnergyRegisters(registers);

    for (const key of ["voltage", "current", "power"] as const) {
      expect(result[key]).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("ignores extra registers beyond the first six", () => {
    const registers = [
      ...floatToRegisters(100),
      ...floatToRegisters(1),
      ...floatToRegisters(0.1),
      // extra noise that must not affect the result
      0xffff,
      0x0000,
    ];

    const result = parseEnergyRegisters(registers);
    expect(result.voltage).toBe("100.00");
  });

  it("throws a descriptive error when fewer than 6 registers are provided", () => {
    expect(() => parseEnergyRegisters([1, 2, 3, 4])).toThrowError(
      /Expected 6, got 4/
    );
  });
});
