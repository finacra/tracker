# Safe file edit script for Windows - prevents EBUSY errors
param(
    [string]$FilePath,
    [string]$OldContent,
    [string]$NewContent
)

$maxRetries = 5
$retryDelay = 500 # milliseconds

for ($i = 0; $i -lt $maxRetries; $i++) {
    try {
        # Try to read the file first to check if it's accessible
        $content = [System.IO.File]::ReadAllText((Resolve-Path $FilePath).Path)
        
        # Perform the replacement
        $newContent = $content -replace [regex]::Escape($OldContent), $NewContent
        
        # Write with retry logic
        $attempt = 0
        while ($attempt -lt 3) {
            try {
                [System.IO.File]::WriteAllText((Resolve-Path $FilePath).Path, $newContent, [System.Text.Encoding]::UTF8)
                Write-Output "File updated successfully"
                return
            } catch {
                $attempt++
                if ($attempt -lt 3) {
                    Start-Sleep -Milliseconds $retryDelay
                } else {
                    throw
                }
            }
        }
    } catch {
        if ($i -eq $maxRetries - 1) {
            Write-Error "Failed to edit file after $maxRetries attempts: $_"
            exit 1
        }
        Write-Warning "Attempt $($i+1) failed, retrying in $retryDelay ms..."
        Start-Sleep -Milliseconds $retryDelay
    }
}
