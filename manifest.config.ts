import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Lightning Lens for Salesforce",
  version: pkg.version,
  icons: {
    48: "public/logo.png",
  },
  web_accessible_resources: [
    {
      resources: [
        "index.html",
        "logo.png",
        "public/inject.js"
      ],
      matches: [
        "https://*.salesforce-setup.com/*",
        "https://*.salesforce.com/*",
        "https://*.force.com/*",
        "https://*.visualforce.com/*",
      ],
    },
  ],
  content_scripts: [
    {
      matches: [
        "https://*.salesforce-setup.com/*",
        "https://*.salesforce.com/*",
        "https://*.force.com/*",
        "https://*.visualforce.com/*",
      ],
      js: ["src/content/main.ts"],
    },
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: ["storage", "cookies"],
  host_permissions: [
    "https://*.salesforce-setup.com/",
    "https://*.salesforce.com/",
    "https://*.force.com/",
    "https://*.visualforce.com/",
  ],
});
