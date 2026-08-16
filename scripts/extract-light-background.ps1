param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$X = 1630,
  [int]$Y = 70,
  [int]$Width = 520,
  [int]$Height = 570
)

Add-Type -AssemblyName System.Drawing.Common
$input = [System.Drawing.Bitmap]::FromFile($InputPath)
$output = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  for ($py = 0; $py -lt $Height; $py++) {
    for ($px = 0; $px -lt $Width; $px++) {
      $color = $input.GetPixel($X + $px, $Y + $py)
      $max = [Math]::Max($color.R, [Math]::Max($color.G, $color.B))
      $min = [Math]::Min($color.R, [Math]::Min($color.G, $color.B))
      $spread = $max - $min
      if ($min -gt 205 -and $spread -le 7) {
        $output.SetPixel($px, $py, [System.Drawing.Color]::Transparent)
      } else {
        $output.SetPixel($px, $py, [System.Drawing.Color]::FromArgb(255, $color.R, $color.G, $color.B))
      }
    }
  }
  $output.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $output.Dispose()
  $input.Dispose()
}
