import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '本地沈浸式翻譯',
    description: '使用本地 Ollama LLM 進行雙語對照網頁翻譯，完全離線，保護隱私',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'tabs'],
    host_permissions: ['http://localhost:11434/*', 'https://www.youtube.com/*'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
  },
});
