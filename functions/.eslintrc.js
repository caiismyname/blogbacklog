module.exports = {
    root: true,
    env: {
        es6: true,
        node: true,
    },
    extends: "airbnb",
    rules: {
        indent: ["error", 4],
        quotes: ["error", "double"],
        "max-len": ["warn", { code: 120 }],
        "operator-linebreak": ["error", "before"],
    },
    parserOptions: {
        ecmaVersion: 2018,
    },
};
