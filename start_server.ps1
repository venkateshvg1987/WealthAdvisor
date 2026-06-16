# Lightweight PowerShell Web Server for Portfolio Tracker
# Run this script to host the client locally on http://localhost:8080/portfoliotracker/

$port = 8080
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

# Start server
try {
    $listener.Start()
} catch {
    Write-Error "Failed to start server. Port $port may already be in use or requires Administrator execution privileges."
    Exit
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Portfolio Tracker Server Running Locally!" -ForegroundColor Green
Write-Host " Access URL: http://localhost:$port/portfoliotracker/" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Press [Ctrl + C] in this window to stop the server." -ForegroundColor Yellow
Write-Host ""

$frontendDir = Join-Path $PSScriptRoot "frontend"

while ($listener.IsListening) {
    $response = $null
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        
        # Base routes redirect
        if ($urlPath -eq "/" -or $urlPath -eq "/portfoliotracker") {
            $response.Redirect("/portfoliotracker/")
            $response.Close()
            continue
        }

        # Normalize file path mapping
        $filePath = ""
        if ($urlPath.StartsWith("/portfoliotracker/")) {
            $subPath = $urlPath.Substring(18) # strip "/portfoliotracker/"
            if ([string]::IsNullOrEmpty($subPath) -or $subPath -eq "/") {
                $subPath = "index.html"
            }
            $filePath = Join-Path $frontendDir $subPath
        }

        if (Test-Path $filePath -PathType Leaf) {
            # Read files and write response
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Content Type Mapping
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "text/html"
            if ($ext -eq ".css") { $contentType = "text/css" }
            elseif ($ext -eq ".js") { $contentType = "application/javascript" }
            elseif ($ext -eq ".png") { $contentType = "image/png" }
            elseif ($ext -eq ".ico") { $contentType = "image/x-icon" }
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 File Not Found - Portfolio Tracker")
            $response.ContentType = "text/plain"
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    } catch {
        Write-Warning "Connection handled: $($_.Exception.Message)"
        if ($null -ne $response) {
            try { $response.Close() } catch {}
        }
    }
}

$listener.Stop()
Write-Host "Server stopped successfully." -ForegroundColor Green
