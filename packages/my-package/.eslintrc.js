module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:jsx-a11y/recommended",
  ],
  plugins: ["react", "@typescript-eslint", "jsx-a11y"],
  rules: {
    "react/prop-types": "off", // Disable prop-types as we use TypeScript
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-unused-vars": "warn",
    "no-magic-numbers": ["warn", { ignore: [0, 1] }],
    complexity: ["warn", { max: 10 }],
    "max-depth": ["warn", 4],
    "jsx-a11y/alt-text": "warn",
    "jsx-a11y/anchor-is-valid": "warn",
    "jsx-a11y/label-has-associated-control": "warn",
    "no-console": "warn",
    "consistent-return": "warn",
    "import/order": ["warn", { "newlines-between": "always" }],
    "no-restricted-syntax": [
      "warn",
      {
        selector:
          'CallExpression[callee.object.name="document"][callee.property.name=/^(getElementById|getElementsByClassName|getElementsByTagName|querySelector|querySelectorAll)$/]',
        message:
          "Do not use document methods directly. Use React refs instead.",
      },
    ],
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
