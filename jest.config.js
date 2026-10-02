/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'test',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/helpers/setup-env.ts'],
  globalSetup: '<rootDir>/helpers/global-setup.ts',
  collectCoverageFrom: ['<rootDir>/../src/**/*.ts'],
  coverageDirectory: '<rootDir>/../coverage',
  testTimeout: 120000,
  maxWorkers: 4,
  clearMocks: true,
};
