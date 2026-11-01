const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    { ignores: ['node_modules/'] },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: { sourceType: 'module', globals: globals.browser }
    },
    {
        files: ['sw.js'],
        languageOptions: { sourceType: 'script', globals: globals.serviceworker }
    },
    {
        files: ['tests/**/*.mjs'],
        languageOptions: { globals: { ...globals.node, ...globals.browser } }
    },
    {
        files: ['eslint.config.js'],
        languageOptions: { sourceType: 'commonjs', globals: globals.node }
    }
];
