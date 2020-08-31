# HTTPS Everywhere Builder

Builds HTTPS Everywhere ruleset files for Brave.

## Configuring

If there are rulesets that are broken and need to be disabled, add them to the `exclusions` list.

## Building locally

    npm install
    npm run build

## Testing locally

1. Copy `out/httpse-rs.json.zip` into `~/.config/BraveSoftware/Brave-Browser-Beta/nceadfeaijjaobpigjldlbaogfokgajf/*/*/` overwriting the existing file.
2. Delete the `httpse-rs.json` file.
3. Start the browser and ensure that <http://https-everywhere.badssl.com/> works.
4. Find a site that was added in the last release and check that it gets upgraded. Check it first with `curl --head` to make sure it doesn't redirect to HTTPS server-side.

## Releasing a new version

1. Connect to the Brave VPN.
2. On Jenkins, look for the `brave-core-ext-https-everywhere-update-publish` job.
3. Click "Build Now".

Once that's done, the new extension should be available within a few minutes.
