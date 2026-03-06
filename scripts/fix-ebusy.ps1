# Fix EBUSY file locking errors on Windows
# Usage: .\scripts\fix-ebusy.ps1 [file-path]

param(
    [string]$FilePath = "app\data-room\page.tsx"
)

Write-Host "🔧 Fixing EBUSY file lock error..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop all Node processes
Write-Host "Step 1: Stopping Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ Stopped $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Green
} else {
    Write-Host "  ✓ No Node.js processes running" -ForegroundColor Green
}
Start-Sleep -Seconds 2

# Step 2: Resolve file path
$resolvedPath = if (Test-Path $FilePath) {
    (Resolve-Path $FilePath).Path
} else {
    Write-Host "  ✗ File not found: $FilePath" -ForegroundColor Red
    exit 1
}

# Step 3: Force release file lock
Write-Host "Step 2: Releasing file lock..." -ForegroundColor Yellow
try {
    # Method 1: Read and rewrite
    $content = [System.IO.File]::ReadAllText($resolvedPath, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($resolvedPath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "  ✓ File lock released" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ Method 1 failed, trying stream method..." -ForegroundColor Yellow
    try {
        # Method 2: Open and close stream
        $stream = [System.IO.File]::Open($resolvedPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
        $stream.Close()
        Write-Host "  ✓ File lock released via stream" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed to release lock: $_" -ForegroundColor Red
        exit 1
    }
}

# Step 4: Clear Next.js cache
Write-Host "Step 3: Clearing Next.js cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
    Write-Host "  ✓ Cache cleared" -ForegroundColor Green
} else {
    Write-Host "  ✓ No cache to clear" -ForegroundColor Green
}

# Step 5: Verify file is accessible
Write-Host "Step 4: Verifying file accessibility..." -ForegroundColor Yellow
try {
    $testContent = [System.IO.File]::ReadAllText($resolvedPath, [System.Text.Encoding]::UTF8)
    $length = $testContent.Length
    Write-Host "  ✓ File is readable (length: $length chars)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ File still locked: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ File is ready! You can now:" -ForegroundColor Green
Write-Host "   1. Start dev server: npm run dev" -ForegroundColor Cyan
Write-Host "   2. Or build: npm run build" -ForegroundColor Cyan
Write-Host ""
