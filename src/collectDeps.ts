import type { Dep } from "./Dep";

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import {
  CallExpression,
  ExportDeclaration,
  Expression,
  ImportDeclaration,
  ModuleDeclaration,
  transformSync,
  VariableDeclaration,
  Span,
  ObjectPattern,
  Identifier,
  ExpressionStatement,
  AssignmentExpression,
  ExportSpecifier,
  ExportNamedDeclaration,
  NamedExportSpecifier,
  KeyValueProperty,
  ExportDefaultDeclaration,
  ExportDefaultExpression,
} from "@swc/core";
import { Visitor } from "@swc/core/Visitor.js";

const span: Span = {
  start: 0,
  end: 0,
  ctxt: 0,
};

// makes an Identifier node
const identifier = (value: string): Identifier => ({
  type: "Identifier",
  value,
  span,
  optional: false,
});

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
            throw new Error(
              `Couldn't resolve: ${depName} imported from ${absPath}`
            );
          }
        }
      }
    };

    class CollectDeps extends Visitor {
      visitImportDeclaration(
        dec: ImportDeclaration
      ): VariableDeclaration | ExpressionStatement | ImportDeclaration {
        if (dec.typeOnly) {
          return dec;
        }

        const { specifiers, source } = dec;
        const depAbsPath = resolve(source.value);

        const depCallNode: CallExpression = {
          type: "CallExpression",
          span,
          callee: identifier("_dep"),
          arguments: [
            {
              expression: {
                type: "StringLiteral",
                span,
                value: depAbsPath,
                hasEscape: false,
              },
            },
          ],
        };

        // import "./module"
        if (specifiers.length === 0) {
          return {
            type: "ExpressionStatement",
            span,
            expression: depCallNode,
          };
        }

        // create a declaration node with a call to _dep.
        const depDeclaration = (
          id: ObjectPattern | Identifier
        ): VariableDeclaration => ({
          type: "VariableDeclaration",
          span,
          kind: "const",
          declare: false,
          declarations: [
            {
              id,
              type: "VariableDeclarator",
              span,
              init: depCallNode,
              definite: false,
            },
          ],
        });

        // import * as module from "./module"
        if (specifiers[0].type === "ImportNamespaceSpecifier") {
          return depDeclaration(identifier(specifiers[0].local.value));
        }

        const imports: { remoteName: string; as: string }[] = specifiers.map(
          (specifier) => {
            const { type, local } = specifier;
            if (type === "ImportSpecifier") {
              return {
                remoteName: specifier.imported
                  ? specifier.imported.value
                  : local.value,
                as: local.value,
              };
            } else if (type === "ImportDefaultSpecifier") {
              return {
                remoteName: "default",
                as: local.value,
              };
            } else {
              throw new Error(`Unexpected specifier node: ${type}`);
            }
          }
        );

        if (!deps.some(({ absPath }) => absPath === depAbsPath)) {
          deps.push({
            absPath: depAbsPath,
            visited: false,
          });
        }

        return depDeclaration({
          type: "ObjectPattern",
          span,
          optional: false,
          properties: imports.map(({ remoteName, as }) => ({
            type: "KeyValuePatternProperty",
            span,
            key: identifier(remoteName),
            value: identifier(as),
          })),
        });
      }

      visitExportDefaultExpression(
        dec: ExportDefaultExpression
      ): ExpressionStatement {
        return {
          type: "ExpressionStatement",
          span,
          expression: {
            type: "AssignmentExpression",
            span,
            operator: "=",
            left: {
              type: "MemberExpression",
              span,
              object: {
                type: "Identifier",
                span,
                value: "module",
                optional: false,
              },
              property: {
                type: "Identifier",
                span,
                value: "exports",
                optional: false,
              },
            },
            right: {
              type: "ObjectExpression",
              span,
              properties: [
                {
                  type: "SpreadElement",
                  spread: span,
                  arguments: {
                    type: "MemberExpression",
                    span,
                    object: {
                      type: "Identifier",
                      span,
                      value: "module",
                      optional: false,
                    },
                    property: {
                      type: "Identifier",
                      span,
                      value: "exports",
                      optional: false,
                    },
                  },
                },
                {
                  type: "KeyValueProperty",
                  key: {
                    type: "StringLiteral",
                    span,
                    value: "default",
                    hasEscape: false,
                    kind: {
                      type: "normal",
                      containsQuote: true,
                    },
                  },
                  value: dec.expression,
                },
              ],
            },
          },
        };
      }

      visitExportNamedDeclaration(
        dec: ExportNamedDeclaration
      ): ExpressionStatement {
        const { specifiers } = dec;

        const exports: {
          name: string;
          as: string;
        }[] = specifiers.map((spec: NamedExportSpecifier) => {
          const {
            orig: { value: name },
          } = spec;

          return {
            name,
            as: spec.exported ? spec.exported.value : name,
          };
        });

        return {
          type: "ExpressionStatement",
          span,
          expression: {
            type: "AssignmentExpression",
            span,
            operator: "=",
            left: {
              type: "MemberExpression",
              span,
              object: {
                type: "Identifier",
                span,
                value: "module",
                optional: false,
              },
              property: {
                type: "Identifier",
                span,
                value: "exports",
                optional: false,
              },
            },
            right: {
              type: "ObjectExpression",
              span,
              properties: [
                {
                  type: "SpreadElement",
                  spread: span,
                  arguments: {
                    type: "MemberExpression",
                    span,
                    object: {
                      type: "Identifier",
                      span,
                      value: "module",
                      optional: false,
                    },
                    property: {
                      type: "Identifier",
                      span,
                      value: "exports",
                      optional: false,
                    },
                  },
                },
                ...exports.map(({ name, as }) => {
                  if (name === as) {
                    return identifier(name);
                  } else {
                    return {
                      type: "KeyValueProperty",
                      span,
                      key: identifier(as),
                      value: identifier(name),
                    } as KeyValueProperty;
                  }
                }),
              ],
            },
          },
        };
      }

      visitExportDeclaration(dec: ExportDeclaration): ModuleDeclaration {
        throw new Error("Variable exports not yet implemented.");
      }

      visitCallExpression(exp: CallExpression): Expression {
        // TODO make sure "require" is never re-defined in the file
        const { callee, arguments: args } = exp;

        if (callee.type !== "Identifier") {
          return exp;
        }

        if (callee.value !== "require") {
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
            absPath: depAbsPath,
            visited: false,
          });
        }

        callee.value = "_dep";
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

export default collectDeps;
