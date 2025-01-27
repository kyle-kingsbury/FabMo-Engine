module.exports = {
    env: {
        amd: true,
        node: true,
        commonjs: true,
        es2021: true,
    },
    globals: {
        async: true,
        log: true,
        process: true,
        setImmediate: true,
        setTimeout: true,
        clearTimeout: true,
        console: true,
    },
    plugins: ["jest", "prettier"],

    extends: ["eslint:recommended", "prettier"],
    parserOptions: {
        ecmaVersion: 12,
    },
    rules: {
        "no-mixed-spaces-and-tabs": "off",
        "prettier/prettier": ["error"],
    },
    ignorePatterns: [
        "dashboard/static/js/libs/socket.io.js",
        "dashboard/static/js/libs/hammer.js",
        "dashboard/static/js/libs/hammer.min.js",
        "dashboard/static/js/libs/jquery.min.js",
        "dashboard/static/js/libs/lockr.min.js",
        "dashboard/static/js/libs/moment.js",
        "dashboard/static/js/libs/pako.min.js",
        "dashboard/static/js/libs/require.js",
        "dashboard/static/js/libs/toastr.min.js",
        "dashboard/static/js/libs/underscore.js",
        "dashboard/static/js/libs/foundation.min.js",
        "dashboard/static/js/libs/backbone.js",
        "dashboard/static/js/events.js",
        "dashboard/apps/",
    ],
    overrides: [
        {
            env: { browser: true, jquery: true },
            files: ["dashboard/**"],
        },
        {
            files: ["test/**"],
            plugins: ["jest"],
            extends: ["plugin:jest/recommended"],
            rules: { "jest/prefer-expect-assertions": "off" },
        },
    ],
};
