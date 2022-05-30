import {
  CallExpression,
  Expression,
  ImportDeclaration,
  transformSync,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { match } from "ts-pattern";

const require = createRequire(import.meta.url);

class CollectDeps extends Visitor {
  visitImportDeclaration(n: ImportDeclaration): ImportDeclaration {
    return n;
  }

  visitCallExpression(exp: CallExpression): Expression {
    // TODO make sure "require" is never re-defined in the file

    const { callee, arguments: args } = exp;

    if (callee.type !== "Identifier") {
      return exp;
    }

    if (args.length !== 1) {
      console.warn("Warning: require called without parameter");
      return exp;
    }

    const { expression: arg } = args[0];

    if (arg.type !== "StringLiteral") {
      return exp;
    }

    const path = arg.value;

    console.log(`Requiring ${path}`);

    return exp;
  }
}

const entryPoint = process.argv[2];
if (!entryPoint) {
  throw new Error("No entrypoint specified");
}

const file = readFileSync(entryPoint).toString();

const deps = [];

const out = transformSync(file, {
  plugin: (m) => new CollectDeps().visitProgram(m),
});
