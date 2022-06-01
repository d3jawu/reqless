import {
  CallExpression,
  Expression,
  ImportDeclaration,
  transformSync,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as fullPath } from "node:path";
import { createRequire } from "node:module";

const entryPoint = fullPath(process.argv[2]);
if (!entryPoint) {
  throw new Error("No entry point specified.");
}

type Dep = {
  kind: "import" | "require";
  absPath: string;
  visited: boolean;
  transformed?: string;
};

const collectDeps = (
  entryPoint
): { transformedEntryPoint: string; deps: Dep[] } => {
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
        if (arg.raw) {
          arg.raw = `"${depAbsPath}"`;
        }
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
  const transformedEntryPoint = visitModule(entryPoint);

  while (true) {
    const unvisitedDeps = deps.filter(({ visited }) => !visited);

    if (unvisitedDeps.length === 0) {
      break;
    }

    unvisitedDeps.forEach((dep) => {
      const transformed = visitModule(dep.absPath);
      dep.visited = true;
      dep.transformed = transformed;
    });
  }

  return { transformedEntryPoint, deps };
};

const generateCode = (transformedEntryPoint: string, deps: Dep[]): string => `
const _require = (dep) => (
  {
  ${deps
    .map(({ absPath, visited, transformed }) => {
      if (!visited) {
        throw new Error(`Dep wasn't transformed: ${absPath}`);
      }

      return `
      "${absPath}": () => {
        const module = { exports: null }

        ${transformed}

        return module.exports;
      },\n`;
    })
    .join("")}
  }[dep] || (() => { throw new Error(\`Unexpected require: \$\{dep\}\`)}))(dep);

${transformedEntryPoint}
`;

const { transformedEntryPoint, deps } = collectDeps(entryPoint);
const out = generateCode(transformedEntryPoint, deps);

const outFile = process.argv[3];
if (outFile) {
  writeFileSync(outFile, out);
} else {
  process.stdout.write(out);
}

export { collectDeps, generateCode };
