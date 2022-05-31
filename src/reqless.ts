import {
  CallExpression,
  Expression,
  ImportDeclaration,
  transformSync,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { match } from "ts-pattern";

const entryPoint = resolve(process.argv[2]);
if (!entryPoint) {
  throw new Error("No entrypoint specified");
}

type Dep = {
  kind: "import" | "require";
  absPath: string;
  visited: boolean;
};

const deps: Dep[] = [];

// collect a module's dependencies and return a transformed version of the module
const visitModule = (absPath): string => {
  const require = createRequire(absPath);
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

      const { value: path } = arg;

      const depAbsPath = require.resolve(path);

      if (!deps.some(({ absPath }) => absPath === depAbsPath)) {
        deps.push({
          kind: "require",
          absPath: require.resolve(path),
          visited: false,
        });
      }

      return exp;
    }
  }

  const file = readFileSync(absPath).toString();

  return transformSync(file, {
    plugin: (m) => new CollectDeps().visitProgram(m),
  }).code;
};

// seed deps with entrypoint deps
visitModule(entryPoint);

while (true) {
  const unvisitedDeps = deps.filter(({ visited }) => !visited);

  if (unvisitedDeps.length === 0) {
    break;
  }

  unvisitedDeps.forEach((dep) => {
    visitModule(dep.absPath);
    dep.visited = true;
  });
}

console.log(deps);
