export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'api',
        'worker',
        'db',
        'shared',
        'ui',
        'config',
        'providers',
        'ci',
        'deps',
        'docs',
        'release',
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
  },
};
