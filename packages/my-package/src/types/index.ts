interface CodeReviewResult {
  filePath: string;
  issues: {
    type: string;
    message: string;
    line: number;
    severity: "error" | "warning" | "info";
    suggestion: string;
  }[];
  score: number;
}
