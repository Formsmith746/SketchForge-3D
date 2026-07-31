$ErrorActionPreference = "Stop"

$stripeCommand = Get-Command stripe -ErrorAction SilentlyContinue
$stripePath = if ($stripeCommand) {
  $stripeCommand.Source
} else {
  $wingetStripe = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"
  if (Test-Path -LiteralPath $wingetStripe) { $wingetStripe } else { $null }
}

if (-not $stripePath) {
  throw "The official Stripe CLI is not installed or available on PATH."
}

function Invoke-StripeJson {
  param([Parameter(Mandatory = $true)][string[]]$CommandArgs)
  $raw = & $stripePath @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Stripe CLI command failed."
  }
  return $raw | ConvertFrom-Json
}

$products = Invoke-StripeJson -CommandArgs @("products", "list", "--limit", "100")
$matchingProducts = @($products.data | Where-Object {
  $_.livemode -eq $false -and
  $_.name -eq "SketchForge Cloud" -and
  $_.metadata.app -eq "sketchforge-cloud"
})

if ($matchingProducts.Count -gt 1) {
  throw "Multiple SketchForge Cloud test products already exist; review them before continuing."
}

$product = if ($matchingProducts.Count -eq 1) {
  $matchingProducts[0]
} else {
  Invoke-StripeJson -CommandArgs @(
    "products", "create",
    "--name", "SketchForge Cloud",
    "--description", "20 GB cloud project storage for SketchForge",
    "-d", "metadata[app]=sketchforge-cloud",
    "-d", "metadata[environment]=test"
  )
}

$prices = Invoke-StripeJson -CommandArgs @("prices", "list", "--product", $product.id, "--limit", "100")
$matchingPrices = @($prices.data | Where-Object {
  $_.livemode -eq $false -and
  $_.active -eq $true -and
  $_.currency -eq "usd" -and
  $_.unit_amount -eq 700 -and
  $_.recurring.interval -eq "month"
})

if ($matchingPrices.Count -gt 1) {
  throw "Multiple active $7/month SketchForge Cloud test prices exist; review them before continuing."
}

$price = if ($matchingPrices.Count -eq 1) {
  $matchingPrices[0]
} else {
  Invoke-StripeJson -CommandArgs @(
    "prices", "create",
    "-d", "product=$($product.id)",
    "-d", "unit_amount=700",
    "-d", "currency=usd",
    "-d", "recurring[interval]=month",
    "-d", "metadata[app]=sketchforge-cloud",
    "-d", "metadata[environment]=test"
  )
}

$portalConfigurations = Invoke-StripeJson -CommandArgs @("billing_portal", "configurations", "list", "--limit", "100")
$matchingPortalConfigurations = @($portalConfigurations.data | Where-Object {
  $_.livemode -eq $false -and
  $_.active -eq $true -and
  $_.metadata.app -eq "sketchforge-cloud" -and
  $_.metadata.environment -eq "test"
})

if ($matchingPortalConfigurations.Count -gt 1) {
  throw "Multiple SketchForge Cloud test portal configurations exist; review them before continuing."
}

$portal = if ($matchingPortalConfigurations.Count -eq 1) {
  $matchingPortalConfigurations[0]
} else {
  Invoke-StripeJson -CommandArgs @(
    "billing_portal", "configurations", "create",
    "-d", "business_profile[headline]=Manage your SketchForge Cloud subscription",
    "-d", "business_profile[privacy_policy_url]=https://sketchforge-cloud-staging.sketchforge3d.workers.dev/privacy",
    "-d", "business_profile[terms_of_service_url]=https://sketchforge-cloud-staging.sketchforge3d.workers.dev/terms",
    "-d", "default_return_url=https://sketchforge-cloud-staging.sketchforge3d.workers.dev/cloud/account",
    "-d", "features[customer_update][enabled]=true",
    "-d", "features[customer_update][allowed_updates][]=email",
    "-d", "features[invoice_history][enabled]=true",
    "-d", "features[payment_method_update][enabled]=true",
    "-d", "features[subscription_cancel][enabled]=true",
    "-d", "features[subscription_cancel][mode]=at_period_end",
    "-d", "features[subscription_cancel][proration_behavior]=none",
    "-d", "metadata[app]=sketchforge-cloud",
    "-d", "metadata[environment]=test"
  )
}

[pscustomobject]@{
  product_id = $product.id
  price_id = $price.id
  unit_amount = $price.unit_amount
  currency = $price.currency
  interval = $price.recurring.interval
  portal_configuration_id = $portal.id
  livemode = $false
} | ConvertTo-Json
