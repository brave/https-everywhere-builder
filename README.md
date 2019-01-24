# HTTPS Everywhere Builder

Builds HTTPS Everywhere ruleset files for Brave.

## Configuring

If there are rulesets that are broken and need to be disabled, add them to the `exclusions` list.

## Building locally

    npm install
    npm run build

## Releasing a new version

1. Connect to the Brave VPN.
2. On Jenkins, look for the `brave-core-ext-https-everywhere-update-publish` job.
3. Click "Build Now".

Once that's done, the new extension should be available within a few minutes.
