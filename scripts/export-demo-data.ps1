# Exports the seeded dataset from the local PostgreSQL container into
# apps/web/data/*.json. The web app reads these files so it can run without the
# API or a database.
#
# Usage: pwsh -File scripts/export-demo-data.ps1

$ErrorActionPreference = 'Stop'

$container = 'airline-postgres'
$dbUser = 'airline'
$dbName = 'airline_booking'
$outDir = Join-Path $PSScriptRoot '..\apps\web\data'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Export-Json {
  param([string]$Name, [string]$Sql)

  $sql = "\pset tuples_only on`n\pset format unaligned`n$Sql"
  $file = Join-Path $outDir "$Name.json"

  $raw = $sql | & docker exec -i $container psql -U $dbUser -d $dbName -tA 2>$null
  $text = ($raw | Where-Object { $_ -notmatch '^Output format is unaligned\.?$' }) -join "`n"
  $text = $text.Trim()

  if (-not $text -or $text -eq 'null') { $text = '[]' }

  # Postgres emits JSON with spaces and PowerShell re-wraps single-element results,
  # so unwrap before re-serialising compactly.
    $parsed = $text | ConvertFrom-Json
    if ($parsed -is [System.Management.Automation.PSCustomObject] -and $parsed.PSObject.Properties.Name -contains 'value') {
      $parsed = $parsed.value
    }
    $compact = $parsed | ConvertTo-Json -Depth 40 -Compress
    if ($null -eq $compact) { $compact = '[]' }
    if ($compact -notmatch '^\[') { $compact = "[$compact]" }

  # UTF8Encoding(false) avoids a BOM, which JSON.parse rejects.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($file, $compact, $utf8NoBom)
  Write-Output ("{0,-14} {1,12:N0} bytes" -f "$Name.json", (Get-Item $file).Length)
}

Export-Json 'airports' @'
select json_agg(t) from (
  select "iataCode", name, city, country, timezone
  from airports where "isActive" order by "iataCode"
) t;
'@

Export-Json 'airlines' @'
select json_agg(t) from (
  select a."iataCode", a.name, a."logoUrl", count(f.id)::int as "flightCount"
  from airlines a left join flights f on f."airlineId" = a.id
  group by a.id, a."iataCode", a.name, a."logoUrl"
  order by a."iataCode"
) t;
'@

Export-Json 'flights' @'
select json_agg(t) from (
  select
    f.id,
    f."flightNumber",
    f."departureAt",
    f."arrivalAt",
    f."durationMinutes",
    f.status::text as status,
    json_build_object('iataCode', al."iataCode", 'name', al.name, 'logoUrl', al."logoUrl") as airline,
    json_build_object('iataCode', o."iataCode", 'name', o.name, 'city', o.city,
                      'country', o.country, 'timezone', o.timezone) as origin,
    json_build_object('iataCode', d."iataCode", 'name', d.name, 'city', d.city,
                      'country', d.country, 'timezone', d.timezone) as destination,
    coalesce((
      select json_agg(fr order by fr.total)
      from (
        select fa.id, (fa."basePrice" + fa.taxes + fa.fees)::int as total, fa.currency,
               fa."seatsAvailable",
               json_build_object('cabin', fc.cabin::text, 'name', fc.name,
                                 'isRefundable', fc."isRefundable") as "fareClass"
        from fares fa join fare_classes fc on fc.id = fa."fareClassId"
        where fa."flightId" = f.id
      ) fr
    ), '[]'::json) as fares
  from flights f
  join airlines al on al.id = f."airlineId"
  join airports o on o.id = f."originId"
  join airports d on d.id = f."destinationId"
  where f."departureAt" > now()
    and f.id in (
      -- One representative day per route keeps the demo bundle small while
      -- still covering every origin/destination pair and cabin.
      select distinct on (f2."originId", f2."destinationId") f2.id
      from flights f2
      where f2."departureAt" > now()
      order by f2."originId", f2."destinationId", f2."departureAt"
    )
  order by f."departureAt", f."flightNumber"
) t;
'@

Export-Json 'seat-maps' @'
select json_agg(t) from (
  select
    f.id as "flightId",
    coalesce(ac.model, sl."aircraftModel", 'Unknown') as "aircraftModel",
    coalesce(sl.configuration, 'Standard') as configuration,
    coalesce((
      select json_agg(sc order by sc.cabin)
      from (
        select
          s.cabin::text as cabin,
          count(*)::int as "totalSeats",
          count(*) filter (where s.status = 'AVAILABLE')::int as available,
          count(*) filter (where s.status = 'HELD')::int as held,
          count(*) filter (where s.status = 'BOOKED')::int as booked,
          count(*) filter (where s.status = 'BLOCKED')::int as blocked
        from seats s
        where s."flightId" = f.id
        group by s.cabin
      ) sc
    ), '[]'::json) as cabins
  from flights f
  left join aircraft ac on ac.id = f."aircraftId"
  left join seat_layouts sl on sl.id = f."seatLayoutId"
  where f."departureAt" > now()
    and f.id in (
      select distinct on (f2."originId", f2."destinationId") f2.id
      from flights f2
      where f2."departureAt" > now()
      order by f2."originId", f2."destinationId", f2."departureAt"
    )
) t;
'@

Write-Output 'done'
