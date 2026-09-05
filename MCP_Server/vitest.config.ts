import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The MCP server has side-effectful module-level code (PLC polling,
    // Influx write clients, etc). Tests mock those boundaries, but we still
    // isolate each test file into its own module registry to avoid shared
    // singleton state leaking between suites.
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
  },
});
