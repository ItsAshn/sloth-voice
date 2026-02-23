import { extendConfig } from "@builder.io/qwik-city/vite";
import { staticAdapter } from "@builder.io/qwik-city/adapters/static/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["@qwik-city-plan", "src/entry.ssr.tsx"],
      },
    },
    plugins: [
      staticAdapter({
        origin: "https://slothvoice.com",
      }),
    ],
  };
});
