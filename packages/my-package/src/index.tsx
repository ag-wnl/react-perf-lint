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
    MemberExpression(path: any) {
      if (
        path.node.object.name === "console" &&
        path.node.property.name === "log"
      ) {
        console.log(
          chalk.yellow(
            `⚠️  Console log found in ${filePath}:${path.node.loc?.start.line}`
          )
        );
        console.log("   - Remove console logs in production.");
      }
    },
    JSXElement(path: any) {
      const openingElement = path.node.openingElement;
      if (
        openingElement.attributes.some(
          (attr: any) => attr.name && attr.name.name === "key"
        ) === false
      ) {
        console.log(
          chalk.red(
            `❌ Missing key prop in list element in ${filePath}:${path.node.loc?.start.line}`
          )
        );
        console.log("   - Ensure each list element has a unique key prop.");
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
