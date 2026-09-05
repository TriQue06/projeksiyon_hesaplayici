# Projeksiyon Hesaplayici icin statik dosya sunucusu.
#
# Bu makinede gercek bir Python kurulumu yok: "python" komutu Microsoft Store
# kisayoluna (WindowsApps stub) dusuyor ve 9009 ile cikiyor. Uygulama fetch()
# ile JSON/SVG okudugu icin file:// ile de acilamiyor (CORS). Bu yuzden dis
# bagimliligi olmayan, .NET HttpListener tabanli bu sunucu kullaniliyor.

param([int]$Port = 8731)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.css'  = 'text/css; charset=utf-8'
    '.ttf'  = 'font/ttf'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.ico'  = 'image/x-icon'
    '.md'   = 'text/markdown; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Sunucu hazir: http://localhost:$Port/  (kok: $root)"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $rel = [uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
            if ($rel -eq '/') { $rel = '/index.html' }
            $path = Join-Path $root ($rel.TrimStart('/') -replace '/', '\')

            # Kok disina cikan istekleri reddet (../ ile dizin gezinmesi)
            $full = [IO.Path]::GetFullPath($path)
            if (-not $full.StartsWith([IO.Path]::GetFullPath($root), [StringComparison]::OrdinalIgnoreCase)) {
                $ctx.Response.StatusCode = 403
            }
            elseif (Test-Path -LiteralPath $full -PathType Leaf) {
                $bytes = [IO.File]::ReadAllBytes($full)
                $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
                $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
                # Uygulama fetch'leri zaten no-store; tarayici eski JSON tutmasin.
                $ctx.Response.Headers.Add('Cache-Control', 'no-store')
                $ctx.Response.ContentLength64 = $bytes.Length
                # HEAD yalnız başlık ister; gövde yazmak hata fırlatıp 500'e düşürüyordu.
                if ($ctx.Request.HttpMethod -ne 'HEAD') {
                    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            }
            else {
                $ctx.Response.StatusCode = 404
            }
        }
        catch { try { $ctx.Response.StatusCode = 500 } catch {} }
        finally { try { $ctx.Response.Close() } catch {} }
    }
}
finally { $listener.Stop(); $listener.Close() }
