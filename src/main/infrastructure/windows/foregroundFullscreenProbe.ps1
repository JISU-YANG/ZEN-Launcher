$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ZenForegroundProbe {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct MONITORINFO {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }
}
"@

function Write-ForwardShortcut {
    try {
        if (-not ('ZenShortcutForward' -as [type])) {
            Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class ZenShortcutForward {
    private const byte VK_SPACE = 0x20;
    private const byte SPACE_SCAN = 0x39;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const int VK_CONTROL = 0x11;
    private const int VK_LCONTROL = 0xA2;
    private const int VK_RCONTROL = 0xA3;

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    private static bool IsDown(int vKey) {
        return (GetAsyncKeyState(vKey) & 0x8000) != 0;
    }

    public static string ReplaySwallowedSpace() {
        // RegisterHotKey already delivered Ctrl and swallowed Space.
        // Replay Space only while Ctrl is still held. A bare Space after
        // Ctrl has been released would land in the fullscreen app as text.
        if (!IsDown(VK_CONTROL) && !IsDown(VK_LCONTROL) && !IsDown(VK_RCONTROL)) {
            return "skipped";
        }

        keybd_event(VK_SPACE, SPACE_SCAN, 0, UIntPtr.Zero);
        keybd_event(VK_SPACE, SPACE_SCAN, KEYEVENTF_KEYUP, UIntPtr.Zero);
        return "forwarded";
    }
}
'@
        }

        $result = [ZenShortcutForward]::ReplaySwallowedSpace()
        [Console]::Out.WriteLine($result)
        [Console]::Out.Flush()
    } catch {
        [Console]::Out.WriteLine('failed')
        [Console]::Out.Flush()
    }
}

function Write-ProbeSample {
    $hwnd = [ZenForegroundProbe]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) {
        [Console]::Out.WriteLine('{"ok":false}')
        [Console]::Out.Flush()
        return
    }

    $rect = New-Object ZenForegroundProbe+RECT
    $hasRect = [ZenForegroundProbe]::GetWindowRect($hwnd, [ref]$rect)
    $monitor = [ZenForegroundProbe]::MonitorFromWindow($hwnd, 2)
    $info = New-Object ZenForegroundProbe+MONITORINFO
    $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf([type][ZenForegroundProbe+MONITORINFO])
    $hasMonitor = $monitor -ne [IntPtr]::Zero -and [ZenForegroundProbe]::GetMonitorInfo($monitor, [ref]$info)

    if (-not $hasRect -or -not $hasMonitor) {
        [Console]::Out.WriteLine('{"ok":false}')
        [Console]::Out.Flush()
        return
    }

    $payload = [ordered]@{
        ok = $true
        foregroundHwnd = $hwnd.ToInt64().ToString()
        left = $rect.Left
        top = $rect.Top
        right = $rect.Right
        bottom = $rect.Bottom
        monitorLeft = $info.rcMonitor.Left
        monitorTop = $info.rcMonitor.Top
        monitorRight = $info.rcMonitor.Right
        monitorBottom = $info.rcMonitor.Bottom
    }
    [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}

[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) {
        break
    }

    if ($line.Trim() -eq 'forward') {
        Write-ForwardShortcut
        continue
    }

    Write-ProbeSample
}
