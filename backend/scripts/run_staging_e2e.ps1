param(
    [string]$BaseUrl = "https://foodnova-backend-staging.onrender.com",
    [string]$AdminEmail = $env:FOODNOVA_STAGING_ADMIN_EMAIL,
    [string]$AdminPassword = $env:FOODNOVA_STAGING_ADMIN_PASSWORD,
    [string]$E2ESecret = $env:FOODNOVA_E2E_SECRET,
    [string]$CustomerEmail = "",
    [string]$CustomerPassword = "StagingPass123!",
    [string]$CustomerPhone = "+15550010001",
    [string]$RiderPhone = $env:FOODNOVA_STAGING_RIDER_PHONE,
    [string]$RiderPassword = $env:FOODNOVA_STAGING_RIDER_PASSWORD,
    [string]$RiderEmail = "",
    [switch]$SkipRiderCreation,
    [int]$WakeTimeoutSeconds = 300,
    [int]$KeepAliveSeconds = 180,
    [string]$OutDir = ".\test_reports\staging-e2e"
)

$ErrorActionPreference = "Stop"

$BaseUrl = $BaseUrl.TrimEnd("/")
$RunId = [int][double]::Parse((Get-Date -UFormat %s))
if (-not $CustomerEmail) { $CustomerEmail = "codex.customer+staging$RunId@foodnova.test" }
if (-not $RiderEmail) { $RiderEmail = "codex.rider+staging$RunId@foodnova.test" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ReportPath = Join-Path $OutDir "foodnova-staging-e2e-$RunId.json"

$Report = [ordered]@{
    run_id = $RunId
    base_url = $BaseUrl
    started_at = (Get-Date).ToString("o")
    accounts = [ordered]@{
        customer_email = $CustomerEmail
        customer_phone = $CustomerPhone
        rider_email = $RiderEmail
        rider_phone = $RiderPhone
        admin_email = $AdminEmail
    }
    ids = [ordered]@{}
    availability = @()
    steps = @()
    timeline = @()
    failures = @()
}

function Protect-Secret([string]$Value) {
    if (-not $Value) { return "" }
    if ($Value.Length -le 8) { return "***" }
    return ("{0}...{1}" -f $Value.Substring(0, 4), $Value.Substring($Value.Length - 4))
}

function Sanitize-Value($Value) {
    if ($null -eq $Value) { return $null }
    if ($Value -is [System.Collections.IDictionary]) {
        $copy = [ordered]@{}
        foreach ($key in $Value.Keys) {
            $keyText = [string]$key
            if ($keyText -match "(?i)password|token|jwt|secret|authorization") {
                $copy[$keyText] = Protect-Secret ([string]$Value[$key])
            } else {
                $copy[$keyText] = Sanitize-Value $Value[$key]
            }
        }
        return $copy
    }
    if ($Value -is [System.Array]) {
        return @($Value | ForEach-Object { Sanitize-Value $_ })
    }
    if ($Value.PSObject -and $Value.PSObject.Properties.Count -gt 0 -and -not ($Value -is [string])) {
        $copy = [ordered]@{}
        foreach ($property in $Value.PSObject.Properties) {
            if ($property.Name -match "(?i)password|token|jwt|secret|authorization") {
                $copy[$property.Name] = Protect-Secret ([string]$property.Value)
            } else {
                $copy[$property.Name] = Sanitize-Value $property.Value
            }
        }
        return $copy
    }
    return $Value
}

function Save-Report {
    $Report.finished_at = (Get-Date).ToString("o")
    $Report | ConvertTo-Json -Depth 80 | Set-Content -Path $ReportPath -Encoding UTF8
}

function Add-Failure([string]$Code, [string]$Message, $Data = $null) {
    $Report.failures += [ordered]@{
        code = $Code
        message = $Message
        data = $Data
        timestamp = (Get-Date).ToString("o")
    }
}

function Add-Step($Name, $Method, $Path, $Status, $Ok, $Body, $RequestBody = $null) {
    $Report.steps += [ordered]@{
        name = $Name
        method = $Method
        path = $Path
        status = $Status
        ok = $Ok
        request = Sanitize-Value $RequestBody
        response = Sanitize-Value $Body
        timestamp = (Get-Date).ToString("o")
    }
    Write-Host ("{0,-34} {1,4} {2}" -f $Name, $Status, $(if ($Ok) { "OK" } else { "FAIL" }))
}

function Invoke-FoodNovaJson {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        $Body = $null,
        [string]$Token = "",
        [hashtable]$Headers = @{},
        [int]$TimeoutSeconds = 90
    )
    $url = "$BaseUrl$Path"
    $out = New-TemporaryFile
    $args = @(
        "-sS", "-L", "--max-time", "$TimeoutSeconds",
        "-X", $Method,
        $url,
        "-w", "%{http_code}",
        "-o", $out.FullName,
        "-H", "User-Agent: FoodNovaStagingE2E/1.0"
    )
    if ($Token) {
        $args += @("-H", "Authorization: Bearer $Token")
    }
    foreach ($headerName in $Headers.Keys) {
        $args += @("-H", "${headerName}: $($Headers[$headerName])")
    }
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 30 -Compress
        $args += @("-H", "Content-Type: application/json", "--data-binary", $json)
    }

    $statusText = & curl.exe @args 2>&1
    $status = 0
    [int]::TryParse(($statusText | Select-Object -Last 1), [ref]$status) | Out-Null
    $raw = Get-Content -Raw $out.FullName -ErrorAction SilentlyContinue
    Remove-Item $out.FullName -Force -ErrorAction SilentlyContinue

    try {
        $parsed = $raw | ConvertFrom-Json -Depth 60
    } catch {
        $parsed = [ordered]@{
            raw = $raw
            curl = ($statusText -join "`n")
        }
    }

    $ok = ($status -ge 200 -and $status -lt 300)
    Add-Step $Name $Method $Path $status $ok $parsed $Body
    return [ordered]@{
        ok = $ok
        status = $status
        body = $parsed
        raw = $raw
    }
}

function Invoke-FoodNovaMultipart {
    param(
        [string]$Name,
        [string]$Path,
        [string]$Token,
        [string]$FieldName,
        [string]$FilePath,
        [string]$ContentType = "text/plain"
    )
    $out = New-TemporaryFile
    $args = @(
        "-sS", "-L", "--max-time", "90",
        "-X", "POST",
        "$BaseUrl$Path",
        "-w", "%{http_code}",
        "-o", $out.FullName,
        "-H", "User-Agent: FoodNovaStagingE2E/1.0",
        "-F", "$FieldName=@$FilePath;type=$ContentType"
    )
    if ($Token) {
        $args += @("-H", "Authorization: Bearer $Token")
    }
    $statusText = & curl.exe @args 2>&1
    $status = 0
    [int]::TryParse(($statusText | Select-Object -Last 1), [ref]$status) | Out-Null
    $raw = Get-Content -Raw $out.FullName -ErrorAction SilentlyContinue
    Remove-Item $out.FullName -Force -ErrorAction SilentlyContinue
    try {
        $parsed = $raw | ConvertFrom-Json -Depth 60
    } catch {
        $parsed = [ordered]@{
            raw = $raw
            curl = ($statusText -join "`n")
        }
    }
    $ok = ($status -ge 200 -and $status -lt 300)
    Add-Step $Name "POST" $Path $status $ok $parsed @{ field = $FieldName; file = [System.IO.Path]::GetFileName($FilePath) }
    return [ordered]@{ ok = $ok; status = $status; body = $parsed; raw = $raw }
}

function Get-Token($Response) {
    $body = $Response.body
    foreach ($name in @("access_token", "accessToken", "token", "jwt")) {
        if ($body.PSObject.Properties.Name -contains $name -and $body.$name) { return $body.$name }
    }
    if ($body.data) {
        foreach ($name in @("access_token", "accessToken", "token", "jwt")) {
            if ($body.data.PSObject.Properties.Name -contains $name -and $body.data.$name) { return $body.data.$name }
        }
    }
    return ""
}

function Get-ObjectField($Object, [string[]]$Names) {
    foreach ($name in $Names) {
        if ($Object -and $Object.PSObject.Properties.Name -contains $name -and $null -ne $Object.$name) {
            return $Object.$name
        }
    }
    return $null
}

function Record-State($Milestone, $CustomerOrder, $AdminOrder, $RiderOrders) {
    $adminData = $AdminOrder.body.order
    if (-not $adminData) { $adminData = $AdminOrder.body.data }
    $customerData = $CustomerOrder.body.order
    if (-not $customerData) { $customerData = $CustomerOrder.body.data }
    $Report.timeline += [ordered]@{
        milestone = $Milestone
        customer = $customerData
        admin = $adminData
        rider = $RiderOrders.body
        status_values = [ordered]@{
            status = Get-ObjectField $adminData @("status")
            order_status = Get-ObjectField $adminData @("order_status", "orderStatus")
            fulfillment_status = Get-ObjectField $adminData @("fulfillment_status", "fulfillmentStatus")
            payment_status = Get-ObjectField $adminData @("payment_status", "paymentStatus")
            dispatch_status = Get-ObjectField $adminData @("dispatch_status", "dispatchStatus")
            delivery_status = Get-ObjectField $adminData @("delivery_status", "deliveryStatus")
            delivery_worker_id = Get-ObjectField $adminData @("delivery_worker_id", "deliveryWorkerId")
            rider_id = Get-ObjectField $adminData @("rider_id", "riderId")
        }
        timestamp = (Get-Date).ToString("o")
    }
}

function Wait-For-StagingHealth {
    $deadline = (Get-Date).AddSeconds($WakeTimeoutSeconds)
    $consecutive = 0
    $attempt = 0
    while ((Get-Date) -lt $deadline -and $consecutive -lt 3) {
        $attempt++
        Write-Host "Health check attempt $attempt; consecutive healthy responses: $consecutive/3"
        $result = Invoke-FoodNovaJson -Name "wake_health_$attempt" -Method "GET" -Path "/health" -TimeoutSeconds 30
        $jsonOk = $false
        if ($result.body -and $result.body.success -eq $true -and $result.body.status -eq "ok") {
            $jsonOk = $true
        }
        if ($result.status -eq 200 -and $jsonOk) {
            $consecutive++
        } else {
            $consecutive = 0
        }
        $Report.availability += [ordered]@{
            attempt = $attempt
            status = $result.status
            json_ok = $jsonOk
            consecutive = $consecutive
            timestamp = (Get-Date).ToString("o")
        }
        if ($consecutive -lt 3) {
            Start-Sleep -Seconds 10
        }
    }
    if ($consecutive -lt 3) {
        Add-Failure "STAGING_UNREACHABLE" "Staging did not return three consecutive /health 200 JSON responses within the wake window."
        Save-Report
        throw "Staging wake-up gate failed. See $ReportPath"
    }
    Write-Host "Staging health gate passed with 3 consecutive healthy responses."
}

function Assert-Step($Response, [string]$Code, [string]$Message) {
    if (-not $Response.ok) {
        Add-Failure $Code $Message $Response.body
        Save-Report
        throw "$Message. See $ReportPath"
    }
}

Wait-For-StagingHealth

$openapi = Invoke-FoodNovaJson "openapi" "GET" "/openapi.json"
Assert-Step $openapi "OPENAPI_FAILED" "OpenAPI must be reachable"
$Report.ids.openapi_paths = ($openapi.body.paths.PSObject.Properties | Measure-Object).Count

if ($E2ESecret) {
    $bootstrapBody = @{
        run_id = "$RunId"
        customer_email = $CustomerEmail
        customer_password = $CustomerPassword
        customer_phone = $CustomerPhone
        rider_email = $RiderEmail
        rider_phone = $(if ($RiderPhone) { $RiderPhone } else { "+2348001000000" })
        rider_password = $(if ($RiderPassword) { $RiderPassword } else { "StagingRider123!" })
        admin_email = $(if ($AdminEmail) { $AdminEmail } else { "codex.admin+staging$RunId@foodnova.test" })
        admin_password = $(if ($AdminPassword) { $AdminPassword } else { "Admin123!" })
    }
    $bootstrap = Invoke-FoodNovaJson -Name "staging_e2e_bootstrap" -Method "POST" -Path "/internal/staging/e2e/bootstrap" -Body $bootstrapBody -Headers @{ "x-foodnova-e2e-secret" = $E2ESecret }
    Assert-Step $bootstrap "STAGING_BOOTSTRAP_FAILED" "Staging E2E bootstrap failed"
    $Report.ids.bootstrap = Sanitize-Value $bootstrap.body
    $AdminEmail = $bootstrap.body.accounts.admin.email
    $AdminPassword = $bootstrap.body.accounts.admin.password
    $CustomerEmail = $bootstrap.body.accounts.customer.email
    $CustomerPassword = $bootstrap.body.accounts.customer.password
    $RiderPhone = $bootstrap.body.accounts.rider.phone
    $RiderPassword = $bootstrap.body.accounts.rider.password
    $SkipRiderCreation = $true
} elseif (-not $AdminEmail -or -not $AdminPassword) {
    throw "Set FOODNOVA_E2E_SECRET for automated staging bootstrap, or set FOODNOVA_STAGING_ADMIN_EMAIL and FOODNOVA_STAGING_ADMIN_PASSWORD."
}

$customerRegister = Invoke-FoodNovaJson "customer_register" "POST" "/api/auth/register" @{
    full_name = "Codex Staging Customer"
    email = $CustomerEmail
    phone = $CustomerPhone
    password = $CustomerPassword
    confirm_password = $CustomerPassword
}
if (-not $customerRegister.ok -and $customerRegister.status -ne 400) {
    Assert-Step $customerRegister "CUSTOMER_REGISTER_FAILED" "Customer registration failed"
}
$CustomerToken = Get-Token $customerRegister
if (-not $CustomerToken) {
    $customerLogin = Invoke-FoodNovaJson "customer_login" "POST" "/api/auth/login" @{
        email = $CustomerEmail
        password = $CustomerPassword
    }
    Assert-Step $customerLogin "CUSTOMER_LOGIN_FAILED" "Customer login failed"
    $CustomerToken = Get-Token $customerLogin
}
if (-not $CustomerToken) { throw "Customer token missing. See $ReportPath" }
$customerUser = $customerRegister.body.user
if (-not $customerUser -and $customerRegister.body.data) { $customerUser = $customerRegister.body.data.user }
if ($customerUser) { $Report.ids.customer_id = $customerUser.id }
$Report.ids.customer_token_present = $true

$customerProfile = Invoke-FoodNovaJson "customer_profile" "GET" "/api/users/me" $null $CustomerToken
Assert-Step $customerProfile "CUSTOMER_PROFILE_FAILED" "Customer profile failed"

$address = Invoke-FoodNovaJson "customer_address_create" "POST" "/api/users/addresses" @{
    label = "Codex Staging Address"
    recipient_name = "Codex Staging Customer"
    phone = $CustomerPhone
    address_line = "123 Staging Validation Street"
    street = "123 Staging Validation Street"
    city = "Toronto"
    state = "Ontario"
    country = "Canada"
    latitude = 43.6532
    longitude = -79.3832
    is_default = $true
} $CustomerToken
Assert-Step $address "ADDRESS_CREATE_FAILED" "Address creation failed"
$addrData = $address.body.address
if (-not $addrData) { $addrData = $address.body.data }
$Report.ids.address_id = $addrData.id

$products = Invoke-FoodNovaJson "products" "GET" "/api/products" $null $CustomerToken
Assert-Step $products "PRODUCTS_FAILED" "Product listing failed"
$productList = $products.body.products
if (-not $productList) { $productList = $products.body.data }
if (-not $productList -or $productList.Count -eq 0) {
    throw "No products available in staging catalog."
}
$product = $productList[0]
$Report.ids.product_id = $product.id
$price = [double]$product.price
$item = @{
    product_id = $product.id
    name = $product.name
    product_name = $product.name
    price = $price
    unit_price = $price
    quantity = 1
    qty = 1
    line_total = $price
}

$order = Invoke-FoodNovaJson "order_create" "POST" "/api/orders" @{
    items = @($item)
    total_amount = $price
    delivery_address = "123 Staging Validation Street, Toronto, Ontario, Canada"
    delivery_address_id = $Report.ids.address_id
    delivery_address_snapshot = @{
        city = "Toronto"
        state = "Ontario"
        country = "Canada"
        latitude = 43.6532
        longitude = -79.3832
    }
    phone = $CustomerPhone
    payment_method = "bank_transfer"
    delivery_method = "delivery"
    delivery_notes = "Codex staging validation order"
} $CustomerToken
Assert-Step $order "ORDER_CREATE_FAILED" "Order creation failed"
$orderData = $order.body.order
if (-not $orderData) { $orderData = $order.body.data }
$Report.ids.order_id = $orderData.id
$Report.ids.order_code = $orderData.order_code
$Report.timeline += [ordered]@{ milestone = "order_created"; status_values = $orderData; timestamp = (Get-Date).ToString("o") }

$receiptFile = Join-Path $OutDir "codex-staging-receipt-$RunId.txt"
"FoodNova Codex staging receipt validation $RunId" | Set-Content -Path $receiptFile -Encoding UTF8
$receipt = Invoke-FoodNovaMultipart "receipt_upload" "/api/orders/$($Report.ids.order_id)/receipt" $CustomerToken "file" $receiptFile "text/plain"
if (-not $receipt.ok) {
    Add-Failure "RECEIPT_UPLOAD_FAILED" "Receipt upload failed. This may be expected if staging rejects text receipts or Cloudinary is absent." $receipt.body
}

Invoke-FoodNovaJson "notifications_customer" "GET" "/api/notifications" $null $CustomerToken | Out-Null
$invoice = Invoke-FoodNovaJson "invoice_customer" "GET" "/api/orders/$($Report.ids.order_id)/invoice" $null $CustomerToken
if (-not $invoice.ok) { Add-Failure "INVOICE_FAILED" "Invoice retrieval failed" $invoice.body }
Invoke-FoodNovaJson "tracking_before_assignment" "GET" "/api/orders/$($Report.ids.order_id)/rider-location" $null $CustomerToken | Out-Null

$adminLogin = Invoke-FoodNovaJson "admin_login" "POST" "/auth/admin/login" @{
    email = $AdminEmail
    password = $AdminPassword
}
Assert-Step $adminLogin "ADMIN_LOGIN_FAILED" "Admin login failed"
$AdminToken = Get-Token $adminLogin
if (-not $AdminToken) { throw "Admin token missing. See $ReportPath" }
$adminUser = $adminLogin.body.user
if (-not $adminUser) { $adminUser = $adminLogin.body.admin }
if (-not $adminUser -and $adminLogin.body.data) { $adminUser = $adminLogin.body.data.user }
if ($adminUser) { $Report.ids.admin_id = $adminUser.id }

$adminBefore = Invoke-FoodNovaJson "admin_order_before_payment" "GET" "/admin/orders/$($Report.ids.order_id)" $null $AdminToken
Assert-Step $adminBefore "ADMIN_ORDER_BEFORE_FAILED" "Admin order retrieval before payment failed"

$payment = Invoke-FoodNovaJson "admin_payment_confirm" "PATCH" "/admin/orders/$($Report.ids.order_id)" @{
    payment_status = "payment_confirmed"
    note = "Codex staging payment approval"
} $AdminToken
Assert-Step $payment "PAYMENT_CONFIRM_FAILED" "Payment confirmation failed"

$adminAfter = Invoke-FoodNovaJson "admin_order_after_payment" "GET" "/admin/orders/$($Report.ids.order_id)" $null $AdminToken
Assert-Step $adminAfter "ADMIN_ORDER_AFTER_FAILED" "Admin order retrieval after payment failed"
$audit = Invoke-FoodNovaJson "payment_audit_order" "GET" "/admin/orders/$($Report.ids.order_id)/payment-audit" $null $AdminToken
Assert-Step $audit "PAYMENT_AUDIT_FAILED" "Payment audit endpoint failed"
Record-State "after_payment_confirm" (Invoke-FoodNovaJson "customer_order_after_payment" "GET" "/api/orders/$($Report.ids.order_id)" $null $CustomerToken) $adminAfter ([ordered]@{ body = @{} })

$riderToken = ""
if ($RiderPhone -and $RiderPassword -and $SkipRiderCreation) {
    $riderLogin = Invoke-FoodNovaJson "rider_login_existing" "POST" "/delivery/auth/login" @{
        phone_number = $RiderPhone
        password = $RiderPassword
    }
    Assert-Step $riderLogin "RIDER_LOGIN_FAILED" "Existing rider login failed"
    $riderToken = Get-Token $riderLogin
} else {
    $riderEmailCheck = Invoke-FoodNovaJson "rider_check_email" "POST" "/delivery/auth/check-email" @{ email = $RiderEmail }
    if (-not $riderEmailCheck.ok) { Add-Failure "RIDER_EMAIL_CHECK_FAILED" "Rider email check failed" $riderEmailCheck.body }
    $riderOtp = Invoke-FoodNovaJson "rider_send_otp" "POST" "/delivery/auth/send-otp" @{ email = $RiderEmail }
    if (-not $riderOtp.ok) {
        Add-Failure "RIDER_CREATION_BLOCKED_BY_EMAIL" "Rider creation requires staging email configuration or a pre-created rider account. Rerun with -SkipRiderCreation and FOODNOVA_STAGING_RIDER_PHONE/PASSWORD." $riderOtp.body
    }
}

if ($riderToken) {
    $riderMe = Invoke-FoodNovaJson "rider_me_before_online" "GET" "/delivery/me" $null $riderToken
    Assert-Step $riderMe "RIDER_ME_FAILED" "Rider profile failed"
    $worker = $riderMe.body.worker
    if ($worker) { $Report.ids.rider_id = $worker.id; $Report.ids.worker_id = $worker.id }

    $fcm = Invoke-FoodNovaJson "rider_register_fcm" "POST" "/delivery-workers/register-fcm-token" @{
        token = "codex-staging-dummy-token-$RunId"
        platform = "android"
    } $riderToken
    if (-not $fcm.ok) { Add-Failure "FCM_REGISTER_FAILED" "FCM token registration failed" $fcm.body }

    $online = Invoke-FoodNovaJson "rider_go_online" "POST" "/delivery/go-online" @{
        latitude = 43.6532
        longitude = -79.3832
        accuracy = 10
        heading = 90
        speed = 0
        timestamp = (Get-Date).ToString("o")
    } $riderToken
    Assert-Step $online "RIDER_GO_ONLINE_FAILED" "Rider go-online failed"

    $offers = Invoke-FoodNovaJson "delivery_offers_poll" "GET" "/delivery/offers" $null $riderToken
    Assert-Step $offers "OFFERS_POLL_FAILED" "Delivery offers polling failed"
    $offerList = $offers.body.offers
    if (-not $offerList) { $offerList = $offers.body.data }
    if (-not $offerList -or $offerList.Count -eq 0) {
        Add-Failure "NO_OFFER_VISIBLE" "No delivery offer was visible after rider went online and payment was confirmed." $offers.body
    } else {
        $offer = $offerList | Where-Object { $_.order_id -eq $Report.ids.order_id -or $_.order_code -eq $Report.ids.order_code } | Select-Object -First 1
        if (-not $offer) { $offer = $offerList[0] }
        $Report.ids.offer_id = $offer.id
        $accept = Invoke-FoodNovaJson "offer_accept" "POST" "/delivery/offers/$($Report.ids.offer_id)/accept" @{} $riderToken
        Assert-Step $accept "OFFER_ACCEPT_FAILED" "Offer accept failed"

        $riderOrders = Invoke-FoodNovaJson "rider_orders_after_accept" "GET" "/delivery/orders" $null $riderToken
        Record-State "after_offer_accept" (Invoke-FoodNovaJson "customer_order_after_accept" "GET" "/api/orders/$($Report.ids.order_id)" $null $CustomerToken) (Invoke-FoodNovaJson "admin_order_after_accept" "GET" "/admin/orders/$($Report.ids.order_id)" $null $AdminToken) $riderOrders

        foreach ($status in @("arrived_at_pickup", "picked_up", "in_transit", "arrived")) {
            $statusRes = Invoke-FoodNovaJson "delivery_status_$status" "PATCH" "/delivery/orders/$($Report.ids.order_id)/status" @{ delivery_status = $status; note = "Codex staging $status" } $riderToken
            Assert-Step $statusRes "STATUS_$($status.ToUpper())_FAILED" "Delivery status $status failed"
            $loc = Invoke-FoodNovaJson "location_ping_$status" "POST" "/delivery/location-ping" @{
                latitude = 43.6532
                longitude = -79.3832
                accuracy = 8
                heading = 90
                speed = 2
                timestamp = (Get-Date).ToString("o")
            } $riderToken
            if (-not $loc.ok) { Add-Failure "LOCATION_PING_FAILED" "Location ping failed at $status" $loc.body }
            $tracking = Invoke-FoodNovaJson "tracking_$status" "GET" "/api/orders/$($Report.ids.order_id)/rider-location" $null $CustomerToken
            $Report.timeline += [ordered]@{ milestone = $status; tracking = $tracking.body; timestamp = (Get-Date).ToString("o") }
            if ((New-TimeSpan -Start ([datetime]$Report.started_at) -End (Get-Date)).TotalSeconds -gt $KeepAliveSeconds) {
                Invoke-FoodNovaJson "keepalive_health" "GET" "/health" | Out-Null
            }
        }

        $freshOrder = Invoke-FoodNovaJson "admin_order_before_pin" "GET" "/admin/orders/$($Report.ids.order_id)" $null $AdminToken
        $pinSource = $freshOrder.body.order
        if (-not $pinSource) { $pinSource = $freshOrder.body.data }
        $pin = Get-ObjectField $pinSource @("delivery_code", "delivery_pin", "deliveryPin")
        $Report.ids.delivery_pin_present = [bool]$pin
        $wrongPin = Invoke-FoodNovaJson "pin_wrong" "POST" "/delivery/orders/$($Report.ids.order_id)/proof" @{ delivery_code = "0000"; note = "Codex wrong PIN test" } $riderToken
        if ($wrongPin.status -lt 400) {
            Add-Failure "WRONG_PIN_ACCEPTED" "Wrong delivery PIN was accepted." $wrongPin.body
        }
        if ($pin) {
            $rightPin = Invoke-FoodNovaJson "pin_correct" "POST" "/delivery/orders/$($Report.ids.order_id)/proof" @{ delivery_code = "$pin"; note = "Codex correct PIN completion" } $riderToken
            Assert-Step $rightPin "CORRECT_PIN_FAILED" "Correct delivery PIN completion failed"
            Record-State "delivered" (Invoke-FoodNovaJson "customer_order_delivered" "GET" "/api/orders/$($Report.ids.order_id)" $null $CustomerToken) (Invoke-FoodNovaJson "admin_order_delivered" "GET" "/admin/orders/$($Report.ids.order_id)" $null $AdminToken) (Invoke-FoodNovaJson "rider_orders_delivered" "GET" "/delivery/orders" $null $riderToken)
        } else {
            Add-Failure "PIN_NOT_VISIBLE_TO_ADMIN_API" "Could not locate delivery PIN in admin order response for completion test." $freshOrder.body
        }
    }
}

Invoke-FoodNovaJson "unauthorized_delivery_offers" "GET" "/delivery/offers" | Out-Null

Save-Report
Write-Host ""
Write-Host "FoodNova staging E2E report: $ReportPath"
Write-Host "Failures: $($Report.failures.Count)"
if ($Report.failures.Count -gt 0) {
    $Report.failures | ConvertTo-Json -Depth 20
    exit 2
}
exit 0
