# HTTPS Everywhere Builder

Builds HTTPS Everywhere ruleset files for Brave.

## Configuring

If there are rulesets that are broken and need to be disabled, add them to the `exclusions` list.

## Building locally

    npm install
    npm run build

## Uploading to S3

`npm run upload [-- --prod]`

Without the `prod` option, this uploads to the test bucket.
