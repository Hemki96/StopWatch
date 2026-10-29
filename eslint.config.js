/**
 * ESLint: nur die Hook-Regeln für den Anwendungscode.
 *
 * TypeScript prüft keine Hook-Abhängigkeiten. `react-hooks/exhaustive-deps`
 * schließt diese Lücke und läuft als Fehler, damit eine fehlende Abhängigkeit
 * nicht als Warnung untergeht. Weitere Stilregeln sind für `src/` und `e2e/`
 * bewusst nicht aktiv: Der Bestand soll nicht wegen Formatierung großflächig
 * umgeschrieben werden. `@eslint/js` gilt nur für die JS-Werkzeugdateien.
 */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'test-results/', 'playwright-report/'],
  },
  tseslint.configs.base,
  {
    // Nur Werkzeugdateien in JavaScript; der Anwendungscode ist TypeScript.
    files: ['**/*.{js,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}', '*.config.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Reine HMR-Hilfe; als Warnung sichtbar, ohne den Lauf zu blockieren.
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // Bewusst mit dem Provider geteilte Helfer und Hook.
          allowExportNames: ['useApp', 'leseEinstellungen', 'ergebnisZeilen'],
        },
      ],
    },
  },
)
