/**
 * main file which runs the lint
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { getTSXFiles } from "./utils/fileUtils";
import { calculateCyclomaticComplexity } from "./utils/complexityUtils";

const analyzeFile = (filePath: string): CodeReviewResult => {
  const result: CodeReviewResult = {
    filePath,
    issues: [],
    score: 100,
  };

  const addIssue = (
    type: string,
    message: string,
    line: number,
    severity: "error" | "warning" | "info",
    suggestion: string
  ) => {
    result.issues.push({ type, message, line, severity, suggestion });
    result.score -= severity === "error" ? 5 : severity === "warning" ? 3 : 1;
  };

  const code = fs.readFileSync(filePath, "utf-8");
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  }) as any;

  const componentComplexity = new Map<string, number>();
  const expensiveOperations = new Set(["map", "filter", "reduce"]);

  traverse(ast, {
    ArrowFunctionExpression(path: any) {
      if (
        path.parent.type === "JSXExpressionContainer" ||
        path.parent.type === "CallExpression"
      ) {
        console.log(
          chalk.yellow(
            `⚠️  Potential performance issue in ${filePath}:${path.node.loc?.start.line}`
          )
        );
        console.log("   - Consider using useCallback to avoid re-renders.");
      }

      // checking expensive operations within a component, which can be taken outside the component and memoized separately:
      if (
        path.parentPath.isJSXExpressionContainer() ||
        path.parentPath.isReturnStatement()
      ) {
        path.traverse({
          CallExpression(innerPath: any) {
            if (
              innerPath.node.callee.type === "MemberExpression" &&
              expensiveOperations.has(innerPath.node.callee.property.name)
            ) {
              console.log(
                chalk.yellow(
                  `⚠️  Expensive operation inside render in ${filePath}:${innerPath.node.loc?.start.line}`
                )
              );
              console.log(
                "   - Consider memoizing the result with useMemo, extracting it outside the component."
              );
            }
          },
        });
      }
    },

    FunctionDeclaration(path: any) {
      if (path.node.id && path.node.id.name.match(/^[A-Z]/)) {
        const componentName = path.node.id.name;
        const propsPassedDown = new Set();

        path.traverse({
          JSXOpeningElement(jsxPath: any) {
            jsxPath.node.attributes.forEach((attr: any) => {
              if (
                attr.type === "JSXAttribute" &&
                attr.value.type === "JSXExpressionContainer"
              ) {
                if (
                  attr.value.expression.type === "Identifier" &&
                  path.node.params.some(
                    (param: any) => param.name === attr.value.expression.name
                  )
                ) {
                  //Found a prop passed down
                  propsPassedDown.add(attr.value.expression.name);
                }
              }
            });
          },
          Identifier(identifierPath: any) {
            if (
              identifierPath.node.name &&
              path.node.params.some(
                (param: any) => param.name === identifierPath.node.name
              )
            ) {
              //Component is using the prop
              propsPassedDown.delete(identifierPath.node.name);
            }
          },
        });

        // check for prop drilling:
        if (propsPassedDown.size > 0) {
          console.log(
            chalk.yellow(
              `⚠️  Potential prop drilling in ${filePath}:${
                path.node.loc?.start.line
              } for props: ${Array.from(propsPassedDown).join(", ")}`
            )
          );
          console.log(
            "   - Consider using Context or a state management library."
          );
        }

        // calc cyclomatic complexity
        const complexity = calculateCyclomaticComplexity(path);
        componentComplexity.set(path.node.id.name, complexity);

        if (complexity > 10) {
          addIssue(
            "high-complexity",
            `Component ${path.node.id.name} is too complex (${complexity})`,
            path.node.loc?.start.line,
            "warning",
            "Break down into smaller components"
          );
        }

        // 1. Strict Prop Types
        const hasPropTypes = path.node.body.body.some(
          (node: any) =>
            node.type === "ExpressionStatement" &&
            node.expression.type === "AssignmentExpression" &&
            node.expression.left.property?.name === "propTypes"
        );

        if (!hasPropTypes) {
          addIssue(
            "missing-prop-types",
            `Component ${path.node.id.name} is missing prop types`,
            path.node.loc?.start.line,
            "warning",
            "Add PropTypes or TypeScript interface"
          );
        }
      }
    },

    ObjectExpression(path: any) {
      if (path.parent.type === "JSXExpressionContainer") {
        console.log(
          chalk.red(
            `❌ Unoptimized object in ${filePath}:${path.node.loc?.start.line}`
          )
        );
        console.log(
          "   - Wrap objects in useMemo to avoid unnecessary re-renders."
        );
      }
    },

    JSXAttribute(path: any) {
      if (path.node.name.name === "style") {
        console.log(
          chalk.red(
            `❌ Inline style detected in ${filePath}:${path.node.loc?.start.line}`
          )
        );
        console.log(
          "   - Consider moving styles to a stylesheet or using useMemo."
        );
      }

      // check inline function defining and directly being passed to jsx attribute
      if (
        path.node.value &&
        path.node.value.type === "JSXExpressionContainer"
      ) {
        if (path.node.value.expression.type === "ArrowFunctionExpression") {
          console.log(
            chalk.yellow(
              `⚠️  Potential performance issue: Inline function in JSX attribute in ${filePath}:${path.node.loc?.start.line}`
            )
          );
          console.log(
            "   - Use useCallback or define the function outside the component."
          );
        }
      }
    },

    CallExpression(path: any) {
      if (
        path.node.callee.name === "useEffect" ||
        path.node.callee.name === "useCallback" ||
        path.node.callee.name === "useMemo"
      ) {
        const hasDependencyArray = path.node.arguments.length > 1;
        if (!hasDependencyArray) {
          console.log(
            chalk.yellow(
              `⚠️  Missing dependency array in ${filePath}:${path.node.loc?.start.line}`
            )
          );
          console.log("   - Ensure all dependencies are specified.");
        }
      }

      if (path.node.callee.name === "useEffect") {
        const dependencies = path.node.arguments[1]?.elements || [];
        const hasPrimitivesOnly = dependencies.every((dep: any) =>
          ["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(
            dep.type
          )
        );

        if (!hasPrimitivesOnly) {
          addIssue(
            "complex-dependencies",
            "useEffect has complex dependencies",
            path.node.loc?.start.line,
            "warning",
            "Memoize dependencies or split effects"
          );
        }
      }

      // Hooks Rules
      if (
        ["useState", "useEffect", "useContext"].includes(path.node.callee.name)
      ) {
        if (
          path.findParent(
            (p: any) => p.isIfStatement() || p.isLogicalExpression()
          )
        ) {
          addIssue(
            "conditional-hook",
            "Hooks should not be called conditionally",
            path.node.loc?.start.line,
            "error",
            "Move hook to top level of component"
          );
        }
      }

      // 3. Accessibility Checks
      if (
        path.node.callee.name === "img" &&
        !path.node.arguments.some(
          (arg: any) =>
            arg.type === "JSXExpressionContainer" &&
            arg.expression.type === "Identifier" &&
            arg.expression.name === "alt"
        )
      ) {
        addIssue(
          "missing-alt-text",
          "Image is missing alt text",
          path.node.loc?.start.line,
          "error",
          "Add descriptive alt text for accessibility"
        );
      }

      // Consistent Naming Conventions
      const name = path.node.callee.name;
      if (
        name &&
        name.match(/^[A-Z]/) &&
        !path.findParent((p: any) => p.isFunctionDeclaration())
      ) {
        addIssue(
          "invalid-naming",
          `Variable ${name} should be camelCase`,
          path.node.loc?.start.line,
          "warning",
          "Use camelCase for variables and functions"
        );
      }

      // No Unused Variables
      if (
        path.node.callee.name === "useState" &&
        !path.scope.bindings[path.node.arguments[0].name]?.referenced
      ) {
        addIssue(
          "unused-variable",
          `Unused variable ${path.node.arguments[0].name}`,
          path.node.loc?.start.line,
          "warning",
          "Remove unused variable"
        );
      }

      // No Magic Numbers
      if (
        path.node.callee.name === "useState" &&
        path.node.arguments[0].value > 10 &&
        !path.findParent(
          (p: any) => p.isVariableDeclarator() || p.isObjectProperty()
        )
      ) {
        addIssue(
          "magic-number",
          `Magic number ${path.node.arguments[0].value} found`,
          path.node.loc?.start.line,
          "warning",
          "Replace with named constant"
        );
      }

      // consistent return types
      const returnTypes = new Set();
      path.traverse({
        ReturnStatement(returnPath: any) {
          if (returnPath.node.argument) {
            returnTypes.add(returnPath.node.argument.type);
          }
        },
      });

      if (returnTypes.size > 1) {
        addIssue(
          "inconsistent-return",
          "Function has inconsistent return types",
          path.node.loc?.start.line,
          "error",
          "Ensure all return paths return the same type"
        );
      }

      if (
        path.node.callee.type === "MemberExpression" &&
        path.node.callee.property?.name === "then" &&
        !path.node.arguments.some(
          (arg: any) => arg.params && arg.params.length > 0
        )
      ) {
        addIssue(
          "missing-error-handling",
          "Promise is missing error handling",
          path.node.loc?.start.line,
          "error",
          "Add .catch() or try/catch block"
        );
      }

      // avoid Deprecated APIs
      const deprecatedMethods = [
        "componentWillMount",
        "componentWillUpdate",
        "componentWillReceiveProps",
      ];
      if (deprecatedMethods.includes(path.node.callee.name)) {
        addIssue(
          "deprecated-method",
          `Deprecated method ${path.node.callee.name} used`,
          path.node.loc?.start.line,
          "error",
          "Use modern React lifecycle methods"
        );
      }

      // Avoid Direct DOM Manipulation
      const domMethods = [
        "getElementById",
        "querySelector",
        "addEventListener",
      ];
      if (
        path.node.callee.type === "MemberExpression" &&
        domMethods.includes(path.node.callee.property?.name)
      ) {
        addIssue(
          "direct-dom-manipulation",
          "Direct DOM manipulation detected",
          path.node.loc?.start.line,
          "error",
          "Use React state and refs instead"
        );
      }
    },

    // todo: do something here
    MemberExpression(path: any) {
      // if (
      //   path.node.object.name === "console" &&
      //   path.node.property.name === "log"
      // ) {
      //   console.log(
      //     chalk.yellow(
      //       `⚠️  Console log found in ${filePath}:${path.node.loc?.start.line}`
      //     )
      //   );
      //   console.log("   - Remove console logs in production.");
      // }
    },

    JSXElement(path: any) {
      // check for large component trees (currently threshold over 20):
      const childCount = path.node.children.filter(
        (child: any) => child.type === "JSXElement"
      ).length;
      if (childCount > 20) {
        console.log(
          chalk.yellow(
            `⚠️  Large component tree in ${filePath}:${path.node.loc?.start.line} - ${childCount} children`
          )
        );
        console.log(
          "   - Consider breaking down the component into smaller sub-components."
        );
      }
    },

    TaggedTemplateExpression(path: any) {
      // check for styled components: analyze the template literal for complexity
      // checks for complicated css-in-js calculations
      if (path.node.tag.name === "styled") {
        const numInterpolations = path.node.quasi.expressions.length;
        if (numInterpolations > 5) {
          console.log(
            chalk.yellow(
              `⚠️  Complex styling logic in styled-component in ${filePath}:${path.node.loc?.start.line}`
            )
          );
          console.log(
            "   - Consider optimizing the styling logic or using CSS variables."
          );
        }
      }
    },

    // Enhanced prop drilling detection
    JSXOpeningElement(path: any) {
      if (path.node.name.type === "JSXIdentifier") {
        const componentName = path.node.name.name;
        if (componentName.match(/^[A-Z]/)) {
          const props = path.node.attributes
            .filter((attr: any) => attr.type === "JSXAttribute")
            .map((attr: any) => attr.name.name);

          if (props.length > 5) {
            addIssue(
              "too-many-props",
              `Component ${componentName} receives too many props (${props.length})`,
              path.node.loc?.start.line,
              "warning",
              "Consider using context or composition"
            );
          }
        }
      }
    },
  });

  return result;
};

const generateReport = (results: CodeReviewResult[]) => {
  let reportContent = "# 📊 Code Review Report\n\n";

  results.forEach((result) => {
    reportContent += `## 📄 ${result.filePath} - Score: ${result.score}/100\n\n`;
    result.issues.forEach((issue) => {
      const severityTag = issue.severity.toUpperCase();
      reportContent += `### ${severityTag} (line ${issue.line}): ${issue.message}\n`;
      reportContent += `**Suggestion:** ${issue.suggestion}\n\n`;
    });
  });

  const totalScore =
    results.reduce((sum, result) => sum + result.score, 0) / results.length;
  reportContent += `# 🏆 Overall Code Quality Score: ${Math.round(
    totalScore
  )}/100\n`;

  fs.writeFileSync("codeReviewResult.md", reportContent);
  console.log(chalk.green("✅ Report generated at codeReviewResult.md"));
};

// run linter
const run = () => {
  console.log(chalk.blue("🔍 Scanning for React performance issues..."));
  const tsxFiles = getTSXFiles(process.cwd());
  if (tsxFiles.length === 0) {
    console.log(chalk.green("✅ No .tsx files found."));
    return;
  }

  const results = tsxFiles.map(analyzeFile);
  generateReport(results);
};

run();
