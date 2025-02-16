import fs from "fs";
import path from "path";

export const getTSXFiles = (dir: string): string[] => {
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
