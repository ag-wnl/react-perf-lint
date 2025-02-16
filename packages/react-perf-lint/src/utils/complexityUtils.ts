export const calculateCyclomaticComplexity = (path: any): number => {
  let complexity = 1;
  path.traverse({
    IfStatement() {
      complexity++;
    },
    ForStatement() {
      complexity++;
    },
    WhileStatement() {
      complexity++;
    },
    SwitchCase(node: any) {
      if (node.test) complexity++;
    },
    LogicalExpression() {
      complexity++;
    },
    ConditionalExpression() {
      complexity++;
    },
  });
  return complexity;
};
