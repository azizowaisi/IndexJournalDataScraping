module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!tests/**/*.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js'
  ]
};
