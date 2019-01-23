# HTTPS Everywhere Builder

Builds HTTPS Everywhere ruleset files for Brave.

## Configuring

If there are rulesets that are broken and need to be disabled, add them to the `exclusions` list.

If there is a breaking ruleset format change, bump the version number in
`package.json` by one major point release. (Ex: 5.2.21 to 5.3.0. The minor
point number is no longer used and can be set to anything.)

## Building

`npm run build`

## Uploading to S3

`npm run upload [-- --prod]`

Without the `prod` option, this uploads to the test bucket.
