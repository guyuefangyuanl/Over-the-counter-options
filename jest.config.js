module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/miniprogram', '<rootDir>/tests', '<rootDir>/__tests__'],
  testMatch: ['**/tests/**/*.spec.js', '**/tests/**/*.test.js', '**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  fakeTimers: { enableGlobally: true },
  modulePathIgnorePatterns: ['<rootDir>/backend/'],
};

