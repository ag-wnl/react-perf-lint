#!/usr/bin/env node

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

// get all tsx files in curr directory
const getTSXFiles = (dir: string): string[] => {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getTSXFiles(filePath));
    } else if (file.endsWith(".tsx")) {
      results.push(filePath);
    }
  }
  return results;
};

// analyze perf:
const analyzeFile = (filePath: string) => {
  const code = fs.readFileSync(filePath, "utf-8");
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

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
  });
};

// run linter
const run = () => {
  console.log(chalk.blue("🔍 Scanning for React performance issues..."));
  const tsxFiles = getTSXFiles(process.cwd());
  if (tsxFiles.length === 0) {
    console.log(chalk.green("✅ No .tsx files found."));
    return;
  }
  tsxFiles.forEach(analyzeFile);
};

run();
