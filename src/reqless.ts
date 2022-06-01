import {
  CallExpression,
  Expression,
  ImportDeclaration,
  transformSync,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import { readFileSync } from "node:fs";
import { resolve as fullPath } from "node:path";
import { createRequire } from "node:module";
import { match } from "ts-pattern";

const entryPoint = fullPath(process.argv[2]);
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
  const resolve = (depName: string) => {
    const tryNames = (function* () {
      yield depName + ".ts";
      yield depName + "/index.ts";
    })();

    let tryName = depName;
    while (true) {
      try {
        return require.resolve(tryName);
      } catch (err) {
        tryName = tryNames.next().value || "";
        if (!tryName) {
          throw new Error(`Couldn't resolve: ${depName}`);
        }
      }
    }
  };

  class CollectDeps extends Visitor {
    visitImportDeclaration(n: ImportDeclaration): ImportDeclaration {
      throw new Error("Import not yet implemented");
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

      const depAbsPath = resolve(path);

      if (!deps.some(({ absPath }) => absPath === depAbsPath)) {
        deps.push({
          kind: "require",
          absPath: depAbsPath,
          visited: false,
        });
      }

      callee.value = "_require";
      arg.value = depAbsPath;
      return exp;
    }
  }

  const file = readFileSync(absPath).toString();

  return transformSync(file, {
    jsc: {
      parser: {
        syntax: "typescript",
      },
      target: "es2020",
    },
    plugin: (m) => new CollectDeps().visitProgram(m),
  }).code;
};

// seed deps with entrypoint deps
const transformedEntrypoint = visitModule(entryPoint);

while (true) {
  const unvisitedDeps = deps.filter(({ visited }) => !visited);

  if (unvisitedDeps.length === 0) {
    break;
  }

  unvisitedDeps.forEach((dep) => {
    const transformed = visitModule(dep.absPath);
    dep.visited = true;
  });
}

const req = ``;

console.log(deps);
