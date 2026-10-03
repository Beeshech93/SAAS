/** Runs against a REAL PostgreSQL (DATABASE_URL, migrations applied). See README → Tests. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  setupFiles: ['<rootDir>/tests/integration/setup-env.ts'],
  testTimeout: 30000,
};
