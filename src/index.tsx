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
