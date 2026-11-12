export type UnitPreference = "Metric" | "Imperial";
export type ConvertibleQuantity = "mass" | "height" | "distance" | "pace";
export type DisplayUnit = "kg" | "lb" | "cm" | "in" | "km" | "mi" | "min/km" | "min/mi";

const POUND_IN_KILOGRAMS = 0.45359237;
const MILES_IN_KILOMETER = 1.609344;
const INCHES_IN_CENTIMETER = 2.54;

function assertFinite(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError("Measurement value must be finite");
}

function assertPreference(preference: UnitPreference): void {
  if (preference !== "Metric" && preference !== "Imperial") throw new RangeError(`Invalid unit preference: ${preference}`);
}

export function displayUnit(quantity: ConvertibleQuantity, preference: UnitPreference): DisplayUnit {
  assertPreference(preference);
  const units: Record<ConvertibleQuantity, readonly [DisplayUnit, DisplayUnit]> = {
    mass: ["kg", "lb"],
    height: ["cm", "in"],
    distance: ["km", "mi"],
    pace: ["min/km", "min/mi"],
  };
  const selected = units[quantity];
  if (!selected) throw new RangeError(`Invalid convertible quantity: ${quantity}`);
  return selected[preference === "Metric" ? 0 : 1];
}

/** Converts a canonical metric value to the profile's display units without display rounding. */
export function toDisplayValue(value: number, quantity: ConvertibleQuantity, preference: UnitPreference): number {
  assertFinite(value);
  assertPreference(preference);
  switch (quantity) {
    case "mass": return preference === "Metric" ? value : value / POUND_IN_KILOGRAMS;
    case "height": return preference === "Metric" ? value : value / INCHES_IN_CENTIMETER;
    case "distance": return preference === "Metric" ? value : value / MILES_IN_KILOMETER;
    case "pace": return preference === "Metric" ? value : value * MILES_IN_KILOMETER;
    default: throw new RangeError(`Invalid convertible quantity: ${quantity}`);
  }
}

/** Converts a display value back to canonical kg, cm, km, or min/km. */
export function toCanonicalValue(value: number, quantity: ConvertibleQuantity, preference: UnitPreference): number {
  assertFinite(value);
  assertPreference(preference);
  switch (quantity) {
    case "mass": return preference === "Metric" ? value : value * POUND_IN_KILOGRAMS;
    case "height": return preference === "Metric" ? value : value * INCHES_IN_CENTIMETER;
    case "distance": return preference === "Metric" ? value : value * MILES_IN_KILOMETER;
    case "pace": return preference === "Metric" ? value : value / MILES_IN_KILOMETER;
    default: throw new RangeError(`Invalid convertible quantity: ${quantity}`);
  }
}
