import laaConfig from '@ministryofjustice/eslint-config-laa'

export default laaConfig({
  extraIgnorePaths: ['assets/**/*.js'],
  extraPathsAllowingDevDependencies: ['.allowed-scripts.mjs'],
})
