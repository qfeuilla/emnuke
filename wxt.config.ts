import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'emnuke',
    description: 'Nukes everything with em dashes from the DOM',
    permissions: ['storage'],
    host_permissions: ['https://raw.githubusercontent.com/*'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'extension@emnuke.com',
          strict_min_version: '109.0',
          data_collection_permissions: {
            required: ['none'],
            optional: [],
          },
        },
      },
    }),
    ...(browser === 'opera' && {
      minimum_opera_version: '91',
    }),
  }),
});
