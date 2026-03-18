import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'emnuke',
    description: 'Nukes everything with em dashes from the DOM',
    permissions: ['storage'],
    host_permissions: ['https://raw.githubusercontent.com/*'],
  },
});
