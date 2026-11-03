const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    { ignores: ['node_modules/'] },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // window.* bridges set by image-transform.js and ui-helpers.js.
                SSImage: 'readonly',
                SSText: 'readonly',
                setupImageResizeHandlers: 'readonly',
                setupTextResizeHandlers: 'readonly',
                // Optional globals: never defined today; every call is behind a typeof guard.
                importImageToCanvas: 'readonly',
                selectAllText: 'readonly',
                updateFontSizeInputForSelectedText: 'readonly'
            }
        },
        // Existing code has these; none is a bug. Warn until they are cleaned up.
        rules: {
            'no-unused-vars': 'warn',
            'no-empty': 'warn',
            'no-useless-assignment': 'warn',
            'no-dupe-keys': 'warn'
        }
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
