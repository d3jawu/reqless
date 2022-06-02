import { writeFileSync } from "node:fs";
import { resolve as fullPath } from "node:path";

import collectDeps from "./collectDeps.js";
import generateCode from "./generateCode.js";

const entryPoint = fullPath(process.argv[2]);
if (!entryPoint) {
  throw new Error("No entry point specified.");
}

const { transformedEntryPoint, deps } = collectDeps(entryPoint);
const out = generateCode(transformedEntryPoint, deps);

const outFile = process.argv[3];
if (outFile) {
  writeFileSync(outFile, out);
} else {
  process.stdout.write(out);
}
