import assert from "node:assert/strict";
import {
  measureReaderLayout,
  sourcePercentForUnit,
  unitForSourcePercent,
} from "./readerLayout";

assert.equal(sourcePercentForUnit(2, 5), 50);
assert.equal(unitForSourcePercent(sourcePercentForUnit(2, 5), 9), 4);
assert.equal(unitForSourcePercent(0, 9), 0);
assert.equal(unitForSourcePercent(100, 9), 8);
assert.equal(unitForSourcePercent(-20, 9), 0);
assert.equal(unitForSourcePercent(120, 9), 8);
assert.equal(unitForSourcePercent(50, 1), 0);

assert.deepEqual(measureReaderLayout(740, 0), {
  viewportWidth: 740,
  unitStride: 788,
  unitCount: 1,
});
assert.deepEqual(measureReaderLayout(740, 1_528), {
  viewportWidth: 740,
  unitStride: 788,
  unitCount: 2,
});
assert.deepEqual(measureReaderLayout(740, 1_529), {
  viewportWidth: 740,
  unitStride: 788,
  unitCount: 3,
});
assert.equal(measureReaderLayout(0, 1_000), null);

console.log("Reader layout mapping checks passed.");
