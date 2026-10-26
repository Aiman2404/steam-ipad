# DeckOS Link - Windows helper.
# Compiled on the fly by PowerShell (no install). Reads one command per line
# on stdin and writes binary messages on stdout:
#   1 byte type ('F' JPEG frame, 'I' JSON info, 'E' error reply, 'L' log)
#   4 bytes little-endian length, then the payload.
# Only 'capture', 'info' and 'brightget' reply; everything else is fire-and-forget.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type -ReferencedAssemblies System.Drawing, System.Windows.Forms, System.Management -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Management;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class DeckHelper {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);

  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  struct INPUT { public uint type; public INPUTUNION u; }

  const uint LEFTDOWN = 0x02, LEFTUP = 0x04, RIGHTDOWN = 0x08, RIGHTUP = 0x10, MIDDLEDOWN = 0x20, MIDDLEUP = 0x40;
  const uint WHEEL = 0x0800, HWHEEL = 0x01000;
  const uint KEYUP = 0x0002, UNICODE = 0x0004;

  static Stream output;
  static int screenIndex = 0;
  static ImageCodecInfo jpeg;

  static void Send(char type, byte[] payload) {
    byte[] header = new byte[5];
    header[0] = (byte)type;
    BitConverter.GetBytes(payload.Length).CopyTo(header, 1);
    output.Write(header, 0, 5);
    output.Write(payload, 0, payload.Length);
    output.Flush();
  }

  static Screen Current() {
    Screen[] all = Screen.AllScreens;
    if (screenIndex < 0 || screenIndex >= all.Length) screenIndex = 0;
    return all[screenIndex];
  }

  static double Num(string s) { return double.Parse(s, CultureInfo.InvariantCulture); }

  static string Info() {
    StringBuilder sb = new StringBuilder("{\"selected\":" + screenIndex + ",\"screens\":[");
    Screen[] all = Screen.AllScreens;
    for (int i = 0; i < all.Length; i++) {
      Rectangle b = all[i].Bounds;
      if (i > 0) sb.Append(',');
      sb.AppendFormat(CultureInfo.InvariantCulture, "{{\"x\":{0},\"y\":{1},\"w\":{2},\"h\":{3},\"primary\":{4}}}",
        b.X, b.Y, b.Width, b.Height, all[i].Primary ? "true" : "false");
    }
    sb.Append("]}");
    return sb.ToString();
  }

  static byte[] Capture(int maxWidth, long quality) {
    Rectangle b = Current().Bounds;
    using (Bitmap full = new Bitmap(b.Width, b.Height, PixelFormat.Format24bppRgb)) {
      using (Graphics g = Graphics.FromImage(full)) {
        g.CopyFromScreen(b.X, b.Y, 0, 0, b.Size, CopyPixelOperation.SourceCopy);
        // CopyFromScreen leaves the pointer out; draw one so remote control is usable.
        Point p = Cursor.Position;
        if (b.Contains(p)) {
          Cursors.Default.Draw(g, new Rectangle(p.X - b.X, p.Y - b.Y, 32, 32));
        }
      }
      int w = Math.Min(maxWidth, b.Width);
      int h = (int)Math.Round((double)b.Height * w / b.Width);
      using (Bitmap scaled = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
        using (Graphics g = Graphics.FromImage(scaled)) {
          g.InterpolationMode = InterpolationMode.Bilinear;
          g.DrawImage(full, 0, 0, w, h);
        }
        EncoderParameters ep = new EncoderParameters(1);
        ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
        using (MemoryStream ms = new MemoryStream()) {
          scaled.Save(ms, jpeg, ep);
          return ms.ToArray();
        }
      }
    }
  }

  // Built-in laptop panels expose brightness over WMI. External monitors
  // usually don't, so this reports supported=false for them.
  static string BrightnessGet() {
    try {
      using (ManagementObjectSearcher s = new ManagementObjectSearcher("root\\WMI", "SELECT CurrentBrightness FROM WmiMonitorBrightness WHERE Active=TRUE")) {
        foreach (ManagementObject o in s.Get()) return "{\"supported\":true,\"level\":" + Convert.ToInt32(o["CurrentBrightness"]) + "}";
      }
    } catch (Exception) {}
    return "{\"supported\":false,\"level\":null}";
  }

  static void BrightnessSet(int level) {
    level = Math.Max(0, Math.Min(100, level));
    using (ManagementObjectSearcher s = new ManagementObjectSearcher("root\\WMI", "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active=TRUE")) {
      foreach (ManagementObject o in s.Get()) o.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)level });
    }
  }

  static void Mouse(uint flags, int data) { mouse_event(flags, 0, 0, data, UIntPtr.Zero); }

  static void Button(string which, bool down) {
    if (which == "r") Mouse(down ? RIGHTDOWN : RIGHTUP, 0);
    else if (which == "m") Mouse(down ? MIDDLEDOWN : MIDDLEUP, 0);
    else Mouse(down ? LEFTDOWN : LEFTUP, 0);
  }

  static void Key(byte vk, bool down) { keybd_event(vk, 0, down ? 0 : KEYUP, UIntPtr.Zero); }

  static void Text(string text) {
    foreach (char c in text) {
      INPUT[] pair = new INPUT[2];
      pair[0].type = 1; pair[0].u.ki.wScan = c; pair[0].u.ki.dwFlags = UNICODE;
      pair[1].type = 1; pair[1].u.ki.wScan = c; pair[1].u.ki.dwFlags = UNICODE | KEYUP;
      SendInput(2, pair, Marshal.SizeOf(typeof(INPUT)));
    }
  }

  static readonly string[] MediaNames = { "playpause", "next", "prev", "volup", "voldown", "mute" };
  static readonly byte[] MediaKeys = { 0xB3, 0xB0, 0xB1, 0xAF, 0xAE, 0xAD };

  static bool Handle(string line) {
    string[] a = line.Trim().Split(' ');
    switch (a[0]) {
      case "info": Send('I', Encoding.UTF8.GetBytes(Info())); return true;
      case "capture": Send('F', Capture(int.Parse(a[1]), long.Parse(a[2]))); return true;
      case "screen": screenIndex = int.Parse(a[1]); return false;
      case "move": {
        Rectangle b = Current().Bounds;
        SetCursorPos(b.X + (int)Math.Round(Num(a[1]) * (b.Width - 1)), b.Y + (int)Math.Round(Num(a[2]) * (b.Height - 1)));
        return false;
      }
      case "down": Button(a[1], true); return false;
      case "up": Button(a[1], false); return false;
      case "click": Button(a[1], true); Button(a[1], false); return false;
      case "dbl": Button("l", true); Button("l", false); Button("l", true); Button("l", false); return false;
      case "wheel": Mouse(WHEEL, int.Parse(a[1])); return false;
      case "hwheel": Mouse(HWHEEL, int.Parse(a[1])); return false;
      case "key": {
        byte vk = byte.Parse(a[1]);
        string mode = a.Length > 2 ? a[2] : "press";
        if (mode != "up") Key(vk, true);
        if (mode != "down") Key(vk, false);
        return false;
      }
      case "combo": {
        // combo 17+67  -> Ctrl+C
        string[] keys = a[1].Split('+');
        foreach (string k in keys) Key(byte.Parse(k), true);
        for (int i = keys.Length - 1; i >= 0; i--) Key(byte.Parse(keys[i]), false);
        return false;
      }
      case "brightget": Send('I', Encoding.UTF8.GetBytes(BrightnessGet())); return true;
      case "brightset": BrightnessSet(int.Parse(a[1])); return false;
      case "text": Text(Encoding.UTF8.GetString(Convert.FromBase64String(a[1]))); return false;
      case "media": {
        int i = Array.IndexOf(MediaNames, a[1]);
        if (i >= 0) { Key(MediaKeys[i], true); Key(MediaKeys[i], false); }
        return false;
      }
      default: throw new Exception("unknown command " + a[0]);
    }
  }

  public static void Run() {
    SetProcessDPIAware();
    foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") jpeg = c;
    output = Console.OpenStandardOutput();
    StreamReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
    Send('L', Encoding.UTF8.GetBytes("ready"));
    string line;
    while ((line = input.ReadLine()) != null) {
      if (line.Length == 0) continue;
      bool replies = line.StartsWith("capture") || line.StartsWith("info") || line.StartsWith("brightget");
      try { Handle(line); }
      catch (Exception e) { Send(replies ? 'E' : 'L', Encoding.UTF8.GetBytes(e.Message)); }
    }
  }
}
'@

[DeckHelper]::Run()
