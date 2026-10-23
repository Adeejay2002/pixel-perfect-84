"use strict";
// Opens a cash drawer that is plugged into the receipt printer (the usual
// "RJ11" connection). Sends the standard ESC/POS drawer-kick command straight
// to the Windows print queue (RAW), so nothing is printed on paper.
//
// Needs the same printer that is chosen under Printer > Select receipt printer…
// Windows only; uses the built-in PowerShell, no extra software.

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const PS_SCRIPT = String.raw`param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$Hex
)
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class JnexRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "Printer not found or not accessible (error " + Marshal.GetLastWin32Error() + ")";
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "Cash drawer";
    di.pDataType = "RAW";
    string err = null;
    if (StartDocPrinter(h, 1, di)) {
      if (StartPagePrinter(h)) {
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        Marshal.Copy(data, 0, p, data.Length);
        int written;
        if (!WritePrinter(h, p, data.Length, out written)) err = "Could not send the drawer command (error " + Marshal.GetLastWin32Error() + ")";
        Marshal.FreeCoTaskMem(p);
        EndPagePrinter(h);
      } else {
        err = "Could not start the print page";
      }
      EndDocPrinter(h);
    } else {
      err = "Could not start the print job (error " + Marshal.GetLastWin32Error() + ")";
    }
    ClosePrinter(h);
    return err;
  }
}
"@
$bytes = New-Object byte[] ($Hex.Length / 2)
for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = [Convert]::ToByte($Hex.Substring($i * 2, 2), 16) }
$result = [JnexRawPrinter]::Send($PrinterName, $bytes)
if ($result) { [Console]::Error.WriteLine($result); exit 2 }
exit 0
`;

// ESC p m t1 t2 : pulse drawer connector pin 2 (m=0, the common one) or pin 5 (m=1), 50 ms on / 500 ms off
function pulseHex(pin) {
  return `1B70${pin === 1 ? "01" : "00"}19FA`;
}

function openDrawer({ printerName, pin = 0, scriptDir, exec = execFile }) {
  return new Promise((resolve) => {
    try {
      if (!printerName) return resolve({ ok: false, error: "No receipt printer selected" });
      fs.mkdirSync(scriptDir, { recursive: true });
      const scriptPath = path.join(scriptDir, "open-drawer.ps1");
      // rewritten each time so an app update can never leave an old script behind
      fs.writeFileSync(scriptPath, PS_SCRIPT, "utf8");
      exec(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-PrinterName", String(printerName), "-Hex", pulseHex(pin)],
        { windowsHide: true, timeout: 15000 },
        (err, _stdout, stderr) => {
          if (!err) return resolve({ ok: true });
          const detail = String(stderr || "").trim().split(/\r?\n/)[0] || (err && err.message) || "failed";
          resolve({ ok: false, error: detail });
        },
      );
    } catch (e) {
      resolve({ ok: false, error: String((e && e.message) || e) });
    }
  });
}

module.exports = { openDrawer, pulseHex, PS_SCRIPT };
