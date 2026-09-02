module.exports = {
  env: {
    node: true,
    browser: true,
  },
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  plugins: ["@typescript-eslint", "react-hooks"],
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2022,
    ecmaFeatures: { jsx: true },
  },
  rules: {
    "@typescript-eslint/no-non-null-assertion": "off",
    // A leading underscore is the established way this repo marks a binding that is
    // deliberately unused (a required prop, a positional callback argument).
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
    ],
  },
};
