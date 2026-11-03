import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default ts.config(
  { ignores: ['dist/**','dist-before-release-*/**','dist-server/**','node_modules/**','android/**','harmony/**','src-tauri/**','test-results/**','playwright-report/**','coverage/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: {...globals.browser,...globals.node} }, rules: {'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]} },
  { files:['src/**/*.{ts,tsx}'], plugins:{'react-hooks':hooks}, rules: {'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'error'} }
);
