const POWERSHELL_PATH_SUFFIX = 'System32\\WindowsPowerShell\\v1.0\\powershell.exe';

const MASTER_MUTE_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMuteDevice {
    [PreserveSig]
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMuteDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    [PreserveSig]
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMuteDevice ppDevice);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MuteDeviceEnumerator {}

public static class ZenMasterMute {
    public static bool IsMuted() {
        var enumerator = (IMuteDeviceEnumerator)(new MuteDeviceEnumerator());
        IMuteDevice device;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 0, out device));
        Guid iid = typeof(IAudioEndpointVolume).GUID;
        object volumeObject;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out volumeObject));
        bool muted;
        Marshal.ThrowExceptionForHR(((IAudioEndpointVolume)volumeObject).GetMute(out muted));
        return muted;
    }
}
"@
if ([ZenMasterMute]::IsMuted()) { 'true' } else { 'false' }
`.trim();

function parseMasterMuteOutput(text) {
    const value = String(text || '').trim().toLowerCase();
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return null;
}

async function readMasterMute({
    platform = process.platform,
    powershellPath = '',
    execFileText = null
} = {}) {
    if (platform !== 'win32' || typeof execFileText !== 'function' || !powershellPath) {
        return null;
    }

    try {
        const stdout = await execFileText(
            powershellPath,
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', MASTER_MUTE_SCRIPT],
            '음소거 상태를 확인하지 못했습니다'
        );
        return parseMasterMuteOutput(stdout);
    } catch (_error) {
        return null;
    }
}

module.exports = {
    POWERSHELL_PATH_SUFFIX,
    MASTER_MUTE_SCRIPT,
    parseMasterMuteOutput,
    readMasterMute
};
