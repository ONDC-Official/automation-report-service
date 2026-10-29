// Jest runs the unit tests in the __tests__ folders under src: the FD judge, and the snapshot
// that pins the Beckn HTML report. The older mocha script (`npm test`) is left as it was.
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
  testTimeout: 60000,
};
