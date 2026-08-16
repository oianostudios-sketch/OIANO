param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$source = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class LogoAlphaExtractor
{
    public static void Run(string inputPath, string outputPath)
    {
        using (var input = new Bitmap(inputPath))
        using (var output = new Bitmap(input.Width, input.Height, PixelFormat.Format32bppArgb))
        {
            int width = input.Width, height = input.Height, count = width * height;
            var rgb = new Color[count];
            var foreground = new bool[count];
            var keep = new bool[count];

            for (int y = 0; y < height; y++)
            for (int x = 0; x < width; x++)
            {
                int i = y * width + x;
                Color c = input.GetPixel(x, y);
                rgb[i] = c;
                int max = Math.Max(c.R, Math.Max(c.G, c.B));
                int min = Math.Min(c.R, Math.Min(c.G, c.B));
                foreground[i] = max >= 28 && (max - min >= 7 || max >= 48);
            }

            var seen = new bool[count];
            var queue = new int[count];
            var component = new int[count];
            int[] dx = {-1, 0, 1, -1, 1, -1, 0, 1};
            int[] dy = {-1,-1,-1,  0, 0,  1, 1, 1};

            for (int seed = 0; seed < count; seed++)
            {
                if (!foreground[seed] || seen[seed]) continue;
                int queueHead = 0, queueTail = 0, componentCount = 0;
                queue[queueTail++] = seed; seen[seed] = true;
                while (queueHead < queueTail)
                {
                    int p = queue[queueHead++]; component[componentCount++] = p;
                    int px = p % width, py = p / width;
                    for (int d = 0; d < 8; d++)
                    {
                        int nx = px + dx[d], ny = py + dy[d];
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        int n = ny * width + nx;
                        if (foreground[n] && !seen[n]) { seen[n] = true; queue[queueTail++] = n; }
                    }
                }
                if (componentCount >= 180)
                    for (int c = 0; c < componentCount; c++) keep[component[c]] = true;
            }

            // Extend retained shapes into their nearby soft glow, without retaining isolated stars.
            var expanded = (bool[])keep.Clone();
            for (int y = 0; y < height; y++)
            for (int x = 0; x < width; x++)
            {
                int i = y * width + x;
                if (keep[i]) continue;
                int max = Math.Max(rgb[i].R, Math.Max(rgb[i].G, rgb[i].B));
                if (max < 10) continue;
                bool near = false;
                for (int oy = -3; oy <= 3 && !near; oy++)
                for (int ox = -3; ox <= 3; ox++)
                {
                    int nx = x + ox, ny = y + oy;
                    if (nx >= 0 && ny >= 0 && nx < width && ny < height && keep[ny * width + nx]) { near = true; break; }
                }
                if (near) expanded[i] = true;
            }

            for (int y = 0; y < height; y++)
            for (int x = 0; x < width; x++)
            {
                int i = y * width + x;
                Color c = rgb[i];
                if (!expanded[i]) { output.SetPixel(x, y, Color.Transparent); continue; }
                int max = Math.Max(c.R, Math.Max(c.G, c.B));
                int alpha = Math.Max(0, Math.Min(255, (max - 7) * 7));
                output.SetPixel(x, y, Color.FromArgb(alpha, c.R, c.G, c.B));
            }
            output.Save(outputPath, ImageFormat.Png);
        }
    }
}
'@

Add-Type -AssemblyName System.Drawing.Common
$frameworkReferences = [AppContext]::GetData('TRUSTED_PLATFORM_ASSEMBLIES').Split([IO.Path]::PathSeparator)
Add-Type -TypeDefinition $source -ReferencedAssemblies $frameworkReferences
[LogoAlphaExtractor]::Run($InputPath, $OutputPath)
