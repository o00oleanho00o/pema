const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const src = fs.readFileSync("catalog.js", "utf8");
const sandbox = { chrome: { storage: { local: {} } } };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

for (const value of ["Thuốc", "thuốc", "THUỐC", " Thuốc "]) assert.strictEqual(sandbox.outputTypeFor(value), "PRESCRIPTION");
for (const value of ["", "Thuoc", "THUOC", "TPCN", "Mỹ Phẩm", "other", null, undefined]) assert.strictEqual(sandbox.outputTypeFor(value), "CONSULTATION");

const data = JSON.parse(fs.readFileSync("default-catalog.json"));
const cat = sandbox.buildCatalog(data.rows);
for (const [key, expected] of Object.entries({ totalRows: 115, usableProducts: 115, prescription: 30, consultation: 85, invalidRows: 0, missingTypeRows: 7, duplicateCodes: 0, duplicateNames: 0 })) assert.strictEqual(cat.counts[key], expected, key);
const items = [
  { sourceName: "Cicaderm Cream 40ml - Kem làm mềm da, dưỡng ẩm, hỗ trợ làm đều màu da, mờ sẹo 40 ml - A", productCode: null },
  { sourceName: "Fudareus B (Hộp 1 tuýp 15g), NSX: Việt Nam - A", productCode: null },
  { sourceName: "not in catalog", productCode: null }
].map((item) => sandbox.matchItem(item, cat, {}, { fuzzyEnabled: false }));
assert.strictEqual(items[0].matchedCode, "H005");
assert.strictEqual(items[0].outputType, "CONSULTATION");
assert.strictEqual(items[1].matchedCode, "H071");
assert.strictEqual(items[1].outputType, "PRESCRIPTION");
assert.strictEqual(items[2].matchStatus, "UNKNOWN");
assert.strictEqual(items[2].outputType, null);

// A stale/manual override must not create an unrecognized route.
const stale = sandbox.matchItem({ sourceName: "not in catalog", productCode: null }, cat, { "not in catalog": { outputType: "BROKEN" } }, { fuzzyEnabled: false });
assert.strictEqual(stale.matchStatus, "UNKNOWN");
assert.strictEqual(sandbox.routeResolvedItems([{ outputType: "BROKEN", matchStatus: "MANUAL" }]).unresolvedItems.length, 1);
console.log(JSON.stringify({ counts: cat.counts, items }, null, 2));
