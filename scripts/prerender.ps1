<#
.SYNOPSIS
  Generates one static, crawlable HTML file per article (articulo/<slug>/index.html)
  and refreshes sitemap.xml, so search engines can index each article individually
  instead of only the SPA's homepage (hash-routed URLs are not reliably indexed).

.NOTES
  Run this after any edit to content/articulos.json (e.g. after using Pages CMS),
  then commit the regenerated files. Requires PowerShell (Windows PowerShell 5.1
  or PowerShell 7+ / pwsh — the same script runs on both, including GitHub
  Actions' ubuntu-latest runners via `pwsh`).
#>

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$SiteUrl = 'https://darkokamii.github.io/bluebiobites'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-JsonUtf8($path) {
  $raw = Get-Content -Raw -Encoding UTF8 -LiteralPath $path
  return $raw | ConvertFrom-Json
}

function Write-Utf8($path, $content) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $content, $Utf8NoBom)
}

function Esc-Html($s) {
  if ($null -eq $s) { return '' }
  $s = $s -replace '&', '&amp;'
  $s = $s -replace '<', '&lt;'
  $s = $s -replace '>', '&gt;'
  $s = $s -replace '"', '&quot;'
  return $s
}

$CATS = @{
  bio   = @{ name='Biología marina'; accent='#17A398'; bgLight='#E1F5EE'; dark='#085041'; emoji='🐟' }
  eco   = @{ name='Ecología marina y conservación'; accent='#4C9A63'; bgLight='#E7F3E9'; dark='#2E5F3B'; emoji='🌿' }
  micro = @{ name='Microbiología marina'; accent='#7B5EA7'; bgLight='#EDE7F5'; dark='#4A3766'; emoji='🧫' }
  biot  = @{ name='Biotecnología marina'; accent='#F2665E'; bgLight='#FCEBE9'; dark='#7A2E28'; emoji='💧' }
  quim  = @{ name='Química y bioquímica marina'; accent='#D98E2B'; bgLight='#FBF0DD'; dark='#6B4614'; emoji='🧪' }
  gen   = @{ name='Genética y genómica marina'; accent='#C9558B'; bgLight='#FBEAF0'; dark='#6E2C4B'; emoji='🧬' }
  ocea  = @{ name='Oceanografía y geología marina'; accent='#4A6B8A'; bgLight='#E7EDF2'; dark='#2A3E50'; emoji='🌊' }
  acui  = @{ name='Acuicultura y ciencias pesqueras'; accent='#5C8A6B'; bgLight='#E9F1EA'; dark='#2F4A38'; emoji='🐠' }
}
$TYPES = @{
  noticia = @{ label='Noticia'; accent='#0B3D57'; bgLight='#E7ECEF'; dark='#0B3D57'; emoji='📰' }
  tecnica = @{ label='Técnica'; accent='#17A398'; bgLight='#E1F5EE'; dark='#085041'; emoji='🔬' }
}
$MONTHS = @{
  enero=1; febrero=2; marzo=3; abril=4; mayo=5; junio=6; julio=7;
  agosto=8; septiembre=9; octubre=10; noviembre=11; diciembre=12
}

function ConvertTo-IsoDate($spanishDate) {
  # "14 julio 2026" -> "2026-07-14". Falls back to $null if it doesn't parse.
  if ($spanishDate -match '^\s*(\d{1,2})\s+([a-záéíóúñ]+)\s+(\d{4})\s*$') {
    $day = [int]$Matches[1]
    $monthName = $Matches[2].ToLowerInvariant()
    $year = [int]$Matches[3]
    if ($MONTHS.ContainsKey($monthName)) {
      return ('{0:0000}-{1:00}-{2:00}' -f $year, $MONTHS[$monthName], $day)
    }
  }
  return $null
}

$sharedCss = @'
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#fff;font-family:'DM Sans',system-ui,sans-serif;color:#12293A}
a{color:#17A398;text-decoration:none}
a:hover{color:#F2665E}
.bbb-skip-link{position:absolute;left:8px;top:-100px;background:#0B3D57;color:#fff;padding:12px 20px;border-radius:6px;z-index:100;transition:top .15s}
.bbb-skip-link:focus{top:8px}
@media(max-width:900px){.bbb-h1{font-size:32px!important}}
'@

$articulos = (Read-JsonUtf8 (Join-Path $RepoRoot 'content/articulos.json')).articulos

$sitemapUrls = New-Object System.Collections.Generic.List[string]
$sitemapUrls.Add("$SiteUrl/")

foreach ($a in $articulos) {
  $cat = $CATS[$a.cat]
  $type = $TYPES[$a.type]
  $iso = ConvertTo-IsoDate $a.date
  $canonical = "$SiteUrl/articulo/$($a.slug)/"
  $sitemapUrls.Add($canonical)

  $bitesHtml = ($a.bites | ForEach-Object {
    "<div style=`"display:flex;gap:12px;align-items:flex-start`"><span style=`"flex:none;width:8px;height:8px;border-radius:50%;margin-top:8px;background:$($cat.accent)`"></span><span style=`"font-size:16px;line-height:1.55;color:$($cat.dark)`">$(Esc-Html $_)</span></div>"
  }) -join "`n"

  $bodyHtml = ($a.body | ForEach-Object {
    "<p style=`"margin:0;font-size:18px;line-height:1.75;color:#12293A;opacity:.9`">$(Esc-Html $_)</p>"
  }) -join "`n"

  $refs = @($a.ref)
  $refLabel = if ($refs.Count -gt 1) { 'referencias' } else { 'referencia' }
  $refHtml = ($refs | ForEach-Object { $i = 0 } {
    $prefix = if ($refs.Count -gt 1) { "<span style=`"opacity:.55`">$($i + 1). </span>" } else { '' }
    $i++
    "<p style=`"margin:0;font-size:15px;line-height:1.65;color:#12293A;opacity:.85`">$prefix$(Esc-Html $_)</p>"
  }) -join "`n"

  $jsonLd = @{
    '@context' = 'https://schema.org'
    '@type' = 'BlogPosting'
    headline = $a.title
    description = $a.excerpt
    inLanguage = 'es'
    articleSection = $cat.name
    author = @{ '@type'='Person'; name='Alejandro Galán'; url="$SiteUrl/#/sobre" }
    publisher = @{ '@type'='Organization'; name='BlueBioBites'; logo=@{ '@type'='ImageObject'; url="$SiteUrl/assets/logo.png" } }
    mainEntityOfPage = @{ '@type'='WebPage'; '@id'=$canonical }
    image = "$SiteUrl/assets/logo.png"
  }
  if ($iso) { $jsonLd.datePublished = $iso }
  $jsonLdJson = $jsonLd | ConvertTo-Json -Depth 6

  $html = @"
<!DOCTYPE html>
<html lang="es">
<head>
<script src="../../analytics.js"></script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$(Esc-Html $a.title) — BlueBioBites</title>
<meta name="description" content="$(Esc-Html $a.excerpt)">
<link rel="canonical" href="$canonical">
<meta name="theme-color" content="#0B3D57">
<link rel="icon" href="../../assets/logo.png">
<link rel="apple-touch-icon" href="../../assets/logo.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="BlueBioBites">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="$(Esc-Html $a.title)">
<meta property="og:description" content="$(Esc-Html $a.excerpt)">
<meta property="og:url" content="$canonical">
<meta property="og:image" content="$SiteUrl/assets/logo.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="$(Esc-Html $a.title)">
<meta name="twitter:description" content="$(Esc-Html $a.excerpt)">
<meta name="twitter:image" content="$SiteUrl/assets/logo.png">
<script type="application/ld+json">
$jsonLdJson
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap" rel="stylesheet">
<style>
$sharedCss
</style>
</head>
<body>
<a class="bbb-skip-link" href="#app">Saltar al contenido</a>
<div id="app" tabindex="-1">
<header style="background:#0B3D57;color:#fff">
  <div style="max-width:1180px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;gap:12px">
    <a href="../../" style="display:flex;align-items:center;gap:12px"><img src="../../assets/logo.png" alt="BlueBioBites" width="619" height="695" style="width:40px;height:auto;display:block;filter:brightness(0) invert(1)"><span style="font-size:19px;color:#fff">bluebiobites</span></a>
  </div>
</header>
<main style="max-width:1180px;margin:0 auto;padding:36px 22px 80px">
  <a href="../../#/articulos" style="font-size:14px;color:#0B3D57;opacity:.7">&larr; Todos los artículos</a>
  <article style="max-width:72ch;margin:26px auto 0">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 13px 5px 5px;font-size:12.5px;background:$($cat.bgLight);color:$($cat.dark)"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:$($cat.accent)">$($cat.emoji)</span>$(Esc-Html $cat.name)</span>
      <span style="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 13px 5px 5px;font-size:12.5px;background:$($type.bgLight);color:$($type.dark)"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:$($type.accent)">$($type.emoji)</span>$(Esc-Html $type.label)</span>
      <span style="font-size:13.5px;color:#12293A;opacity:.55">$(Esc-Html $a.date) &middot; $(Esc-Html $a.read) de lectura</span>
    </div>
    <h1 class="bbb-h1" style="margin:20px 0 0;font-size:46px;line-height:1.08;letter-spacing:-.03em;font-weight:500;color:#0B3D57">$(Esc-Html $a.title)</h1>
    <p style="margin:16px 0 0;font-size:14.5px;color:#12293A;opacity:.75">Por Alejandro Galán</p>

    <div style="margin-top:32px;border:2px solid $($cat.accent);border-radius:14px;padding:24px 26px;background:$($cat.bgLight)">
      <div style="font-size:12px;letter-spacing:.16em;margin-bottom:14px;color:$($cat.dark)">en bocados</div>
      <div style="display:flex;flex-direction:column;gap:12px">
$bitesHtml
      </div>
    </div>

    <div style="margin-top:34px;display:flex;flex-direction:column;gap:22px">
$bodyHtml
    </div>

    <div style="margin-top:38px;border:1px solid #e2ddd2;border-left:4px solid #0B3D57;border-radius:10px;padding:20px 24px;background:#F7F1E3">
      <div style="font-size:12px;letter-spacing:.16em;color:#17A398;margin-bottom:10px">$refLabel</div>
$refHtml
    </div>
  </article>
</main>
<footer style="background:#08293f;color:#fff">
  <div style="max-width:1180px;margin:0 auto;padding:32px 22px;display:flex;flex-direction:column;gap:9px;font-size:14.5px">
    <a href="../../#/inicio" style="color:#fff;opacity:.8">Inicio</a>
    <a href="../../#/sobre" style="color:#fff;opacity:.8">Sobre mí</a>
    <a href="../../#/articulos" style="color:#fff;opacity:.8">Artículos</a>
    <a href="../../#/agenda" style="color:#fff;opacity:.8">Agenda</a>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.15);font-size:13px;opacity:.6">&copy; 2026 BlueBioBites &middot; <a href="../../privacidad.html" style="color:#fff;opacity:.85">Política de privacidad</a></div>
  </div>
</footer>
</div>
<iframe name="bbb-subscribe-frame" id="bbb-subscribe-frame" title="" aria-hidden="true" tabindex="-1" style="position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none"></iframe>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="../../app.js"></script>
</body>
</html>
"@

  $outPath = Join-Path $RepoRoot "articulo/$($a.slug)/index.html"
  Write-Utf8 $outPath $html
  Write-Host "Generated $outPath"
}

$sitemapUrls.Add("$SiteUrl/#/sobre")
$sitemapUrls.Add("$SiteUrl/#/articulos")
$sitemapUrls.Add("$SiteUrl/#/agenda")
$sitemapUrls.Add("$SiteUrl/#/glosario")

$urlEntries = ($sitemapUrls | ForEach-Object { "  <url><loc>$_</loc></url>" }) -join "`n"
$sitemap = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
$urlEntries
</urlset>
"@
Write-Utf8 (Join-Path $RepoRoot 'sitemap.xml') $sitemap
Write-Host "Generated sitemap.xml with $($sitemapUrls.Count) URLs"
