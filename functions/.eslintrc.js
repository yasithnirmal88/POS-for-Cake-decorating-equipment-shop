module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2021,
    "sourceType": "script",
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
    "max-len": "off",
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "object-curly-spacing": "off",
    "indent": ["error", 2, {"SwitchCase": 1}],
    "no-unused-vars": ["warn", {"argsIgnorePattern": "^_" }],
  },
  ignorePatterns: ["node_modules/", "package-lock.json"],
};
