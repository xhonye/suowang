using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class SUOWANGLiteLauncher
{
    private static void WriteDiagnostic(string message)
    {
        string dataDir = Environment.GetEnvironmentVariable("SUOWANG_DATA_DIR");
        if (String.IsNullOrWhiteSpace(dataDir))
        {
            dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SUOWANG"
            );
        }
        string logsDir = Path.Combine(dataDir, "logs");
        Directory.CreateDirectory(logsDir);
        File.WriteAllText(Path.Combine(logsDir, "latest-launcher-error.log"), message);
    }

    [STAThread]
    private static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        try
        {
            string script = Path.Combine(root, "scripts", "start.ps1");
            string powershell = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe"
            );

            if (!File.Exists(script))
            {
                throw new FileNotFoundException("启动文件不存在，请重新安装所往。", script);
            }

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = powershell,
                Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };

            using (Process process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("无法启动所往。请重新安装后再试。");
                }
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            try
            {
                WriteDiagnostic("阶段：启动原生入口" + Environment.NewLine + "原因：" + error.Message);
            }
            catch
            {
                // The dialog remains the final fallback when the log path is unavailable.
            }
            MessageBox.Show(
                error.Message,
                "SUOWANG 启动失败",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return 1;
        }
    }
}
