import assert from "node:assert/strict";
import test from "node:test";
import { addLocalDays, assertIsoInstant, assertLocalDate, localDateAt } from "./time.ts";
import { displayUnit, toCanonicalValue, toDisplayValue } from "./units.ts";

test("canonical metric values convert for display and back without display rounding", () => {
  assert.equal(toDisplayValue(1, "mass", "Imperial"), 1 / 0.45359237);
  assert.equal(toDisplayValue(2.54, "height", "Imperial"), 1);
  assert.equal(toDisplayValue(1.609344, "distance", "Imperial"), 1);
  assert.equal(toDisplayValue(5, "pace", "Imperial"), 5 * 1.609344);
  assert.equal(toCanonicalValue(1, "height", "Imperial"), 2.54);
  assert.equal(toCanonicalValue(1, "distance", "Imperial"), 1.609344);
  assert.equal(toCanonicalValue(10, "pace", "Imperial"), 10 / 1.609344);
  assert.equal(toDisplayValue(70, "mass", "Metric"), 70);
  assert.equal(displayUnit("pace", "Imperial"), "min/mi");
  assert.equal(displayUnit("mass", "Metric"), "kg");
});

test("event local date uses the stored timezone, including daylight-saving offsets", () => {
  assert.equal(localDateAt("2024-01-02T01:30:00Z", "America/Los_Angeles"), "2024-01-01");
  assert.equal(localDateAt("2024-03-10T09:30:00Z", "America/Los_Angeles"), "2024-03-10");
  assert.equal(localDateAt("2024-03-10T10:30:00Z", "America/Los_Angeles"), "2024-03-10");
});

test("date and timestamp validators reject malformed boundaries", () => {
  assert.doesNotThrow(() => assertLocalDate("2024-02-29"));
  assert.throws(() => assertLocalDate("2023-02-29"), RangeError);
  assert.doesNotThrow(() => assertIsoInstant("2024-01-01T12:00:00+09:00"));
  assert.throws(() => assertIsoInstant("2024-01-01T12:00:00"), RangeError);
  assert.throws(() => toDisplayValue(Number.POSITIVE_INFINITY, "mass", "Metric"), RangeError);
  assert.throws(() => toCanonicalValue(1, "mass", "Other" as "Metric"), RangeError);
});

test("calendar-window arithmetic crosses month and year boundaries", () => {
  assert.equal(addLocalDays("2024-01-01", -1), "2023-12-31");
  assert.equal(addLocalDays("2024-02-28", 1), "2024-02-29");
});
