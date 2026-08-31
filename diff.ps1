$a = Get-Content 'C:\Users\User\Downloads\ITA Navagador\index.html'
$b = Get-Content 'C:\Users\User\Downloads\ITA Navagador\ITA-Navegador\index.html'
$diff = Compare-Object $a $b -PassThru
Write-Host ('Total diff lines: ' + $diff.Length)
$diff | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
