import type { Dep } from "./Dep.js";

const generateCode = (transformedEntryPoint: string, deps: Dep[]): string => `
const _dep = (dep) => (
  {
  ${deps
    .map(({ absPath, visited, transformed }) => {
      if (!visited) {
        throw new Error(`Dep wasn't transformed: ${absPath}`);
      }

      return `
      "${absPath}": () => {
        const module = { exports: {} }

        ${transformed}

        return module.exports;
      },\n`;
    })
    .join("")}
  }[dep] || (() => { throw new Error(\`Unbundled dependency: \$\{dep\}\`)}))(dep);

${transformedEntryPoint}
`;

export default generateCode;
