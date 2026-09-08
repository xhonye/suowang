using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

namespace Suowang.Widget;

public sealed record Todo(string Id, string Title, string MinimalStep, string Kind, bool CompletedToday);
public sealed record Mainline(string Id, string Name, List<Todo> Todos);
public sealed record Mode(string Id, string Name, string? CurrentMainlineId, string? PriorityTodoId,
    string? StartedTodoId, List<Mainline> Mainlines, List<Todo> StateTodos)
{
    public IEnumerable<Todo> Choices => Mainlines.Where(m => m.Id == CurrentMainlineId)
        .SelectMany(m => m.Todos).Concat(StateTodos).Where(t => !t.CompletedToday);
    public Todo? Next => Choices.FirstOrDefault(t => t.Id == PriorityTodoId);
    public string Context => Mainlines.FirstOrDefault(m => m.Todos.Any(t => t.Id == Next?.Id))?.Name ?? "其他事项";
}
public sealed record Settings(string LastViewedStateId);
public sealed record Snapshot(Settings Settings, List<Mode> States)
{
    public Mode Current => States.First(s => s.Id == Settings.LastViewedStateId);
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static Snapshot Parse(string json)
    {
        var value = JsonSerializer.Deserialize<Snapshot>(json, Json) ?? throw new InvalidDataException("无效的所往数据。");
        if (value.States.Count != 3 || !new[] { "restore", "work", "life" }.All(id => value.States.Any(s => s.Id == id)))
            throw new InvalidDataException("所往模式数据不完整。");
        _ = value.Current;
        return value;
    }
}

public sealed class Connection : IDisposable
{
    private readonly HttpClient http = new(new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false })
        { Timeout = TimeSpan.FromSeconds(3) };
    private Uri? origin;
    private string? lockText;
    public string DataDirectory { get; }
    public Connection(string? dataDirectory = null)
    {
        DataDirectory = dataDirectory ?? ResolveDirectory();
        if (!Path.IsPathFullyQualified(DataDirectory)) throw new InvalidDataException("数据目录必须是绝对路径。");
    }
    public static string ResolveDirectory()
    {
        var configured = Environment.GetEnvironmentVariable("SUOWANG_DATA_DIR");
        if (!string.IsNullOrWhiteSpace(configured)) return configured;
        var current = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SUOWANG");
        var legacy = Path.Combine("D:", "5Data", "suowang");
        if (File.Exists(Path.Combine(legacy, "suowang.db")))
        {
            if (File.Exists(Path.Combine(current, "suowang.db")))
                throw new InvalidDataException("发现两个所往数据库，请用 SUOWANG_DATA_DIR 指定。");
            return legacy;
        }
        return current;
    }
    public static IEnumerable<int> PortsForPid(string output, int pid)
    {
        foreach (var line in output.Split('\n'))
        {
            var fields = line.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (fields.Length != 5 || fields[0] != "TCP" || fields[2] != "0.0.0.0:0"
                || fields[4] != pid.ToString() || !fields[1].StartsWith("127.0.0.1:")) continue;
            if (int.TryParse(fields[1][10..], out var port) && port > 0 && port <= 65535) yield return port;
        }
    }
    private async Task<Uri> Discover()
    {
        var raw = await File.ReadAllTextAsync(Path.Combine(DataDirectory, "instance.lock"));
        using var doc = JsonDocument.Parse(raw);
        var pid = doc.RootElement.GetProperty("pid").GetInt32();
        if (pid <= 0 || string.IsNullOrEmpty(doc.RootElement.GetProperty("token").GetString()))
            throw new InvalidDataException("所往实例信息无效。");
        using var process = Process.GetProcessById(pid);
        if (process.HasExited) throw new IOException("所往尚未运行。");
        if (origin != null && lockText == raw && await Healthy(origin, pid)) return origin;
        origin = null;
        var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "netstat.exe"), "-ano -p tcp")
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
        using var netstat = Process.Start(start) ?? throw new IOException("无法查找所往服务。");
        var outputTask = netstat.StandardOutput.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await netstat.WaitForExitAsync(timeout.Token);
        foreach (var port in PortsForPid(await outputTask, pid).Distinct())
        {
            var candidate = new Uri($"http://127.0.0.1:{port}/");
            if (!await Healthy(candidate, pid)) continue;
            if (raw != await File.ReadAllTextAsync(Path.Combine(DataDirectory, "instance.lock")))
                throw new IOException("所往正在重启，请重试。");
            lockText = raw;
            return origin = candidate;
        }
        throw new IOException("所往未连接，点击启动所往。");
    }
    private async Task<bool> Healthy(Uri address, int pid)
    {
        try
        {
            using var response = await http.GetAsync(new Uri(address, "health"));
            if (!response.IsSuccessStatusCode) return false;
            using var value = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var root = value.RootElement;
            return root.GetProperty("app").GetString() == "suowang" && root.GetProperty("pid").GetInt32() == pid
                && root.GetProperty("database").GetString() == "ready";
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException) { return false; }
    }
    public async Task<Snapshot> Read() => await Send("GET", "api/snapshot", null);
    public async Task<Snapshot> Send(string method, string path, object? body)
    {
        var address = await Discover();
        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(address, path));
        if (body != null) request.Content = JsonContent.Create(body);
        using var response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new IOException($"操作未保存（{(int)response.StatusCode}），请刷新后重试。");
        return Snapshot.Parse(await response.Content.ReadAsStringAsync());
    }
    public async Task Open() => Process.Start(new ProcessStartInfo((await Discover()).AbsoluteUri) { UseShellExecute = true });
    public void Launch()
    {
        var configured = Environment.GetEnvironmentVariable("SUOWANG_WIDGET_LAUNCHER");
        var programs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
        var executable = new[] { configured, Path.Combine(programs, "SUOWANG Lite", "SUOWANG-Lite.exe"),
            Path.Combine(programs, "SUOWANG", "SUOWANG.exe") }.FirstOrDefault(p => p != null && Path.IsPathFullyQualified(p) && File.Exists(p));
        if (executable == null) throw new IOException("未找到安装版，请先打开所往，再点击重试。");
        if (!executable.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) throw new IOException("启动入口必须是应用程序。");
        Process.Start(new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(executable)! });
    }
    public void Dispose() => http.Dispose();
}
