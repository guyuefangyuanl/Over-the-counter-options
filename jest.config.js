module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/miniprogram', '<rootDir>/tests'],
  testMatch: ['**/tests/**/*.spec.js', '**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  fakeTimers: { enableGlobally: true },
  modulePathIgnorePatterns: ['<rootDir>/backend/'],
};

