using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using WidBar.SDK;

namespace Suowang.Widget;

public sealed class MainPlugin : WidgetPluginBase, IWidgetFlyoutLifecycle
{
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(15) };
    private Connection? connection;
    private Snapshot? snapshot;
    private bool busy, rendering, disposed, editing;
    private TextBlock? preview, title, context, status;
    private TextBox? step, newTitle;
    private ComboBox? modes, choices;
    private Button? start, complete, save, add, launch, retry, open;
    private StackPanel? taskPanel, emptyPanel;
    private string message = "点击连接所往";
    private string? editId;

    public override string Id => "com.suowang.nextstep";
    public override string Name => "所往 · 下一步";
    public override int PreviewLogicalWidth => 180;
    public override int FlyoutWidth => 340;
    public override int FlyoutHeight => 370;
    public override WidgetFlyoutBackdrop FlyoutBackdrop => WidgetFlyoutBackdrop.Mica;

    public override async Task InitializeAsync(IWidgetContext context)
    {
        timer.Tick += async (_, _) => { if (!editing) await Refresh(); };
        timer.Start();
        await Refresh();
    }
    private static TextBlock Text(string value, double size = 13) => new()
        { Text = value, FontSize = size, TextWrapping = TextWrapping.Wrap };
    private static Button Button(string text, Func<Task> action)
    {
        var button = new Button { Content = text, Padding = new Thickness(12, 7, 12, 7) };
        button.Click += async (_, _) => await action();
        return button;
    }
    public override UIElement CreatePreviewContent()
    {
        preview = new TextBlock { FontSize = 12, MaxWidth = 152, TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center };
        var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 7,
            VerticalAlignment = VerticalAlignment.Center, Padding = new Thickness(8, 0, 8, 0) };
        panel.Children.Add(new FontIcon { Glyph = "\uE72A", FontSize = 14,
            Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 87, 157, 201)) });
        panel.Children.Add(preview);
        Render();
        return panel;
    }
    public override UIElement CreateFlyoutContent()
    {
        var panel = new StackPanel { Padding = new Thickness(20), Spacing = 10 };
        modes = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch, PlaceholderText = "选择模式" };
        foreach (var (id, name) in new[] { ("restore", "恢复模式"), ("work", "工作模式"), ("life", "生活模式") })
            modes.Items.Add(new ComboBoxItem { Tag = id, Content = name });
        modes.SelectionChanged += async (_, _) =>
        {
            if (rendering || modes.SelectedItem is not ComboBoxItem selected) return;
            editing = false;
            await Mutate("PATCH", "api/app-state", new { lastViewedStateId = (string)selected.Tag });
        };
        panel.Children.Add(modes);
        context = Text("", 11); context.Opacity = .65; panel.Children.Add(context);
        title = Text("下一步", 21); title.FontWeight = FontWeights.SemiBold; panel.Children.Add(title);

        taskPanel = new StackPanel { Spacing = 10 };
        step = new TextBox { PlaceholderText = "写一个更容易开始的最小一步", MaxLength = 160,
            Header = "最小一步", AcceptsReturn = false };
        step.TextChanged += (_, _) => { if (!rendering) editing = true; };
        taskPanel.Children.Add(step);
        save = Button("保存", async () =>
        {
            if (editId == null) return;
            var id = editId; var text = step.Text;
            await Mutate("PATCH", $"api/todos/{Uri.EscapeDataString(id)}", new { minimalStep = text });
        });
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        start = Button("开始这一步", async () =>
        {
            if (snapshot?.Current.Next is not Todo todo) return;
            await Mutate("POST", $"api/todos/{todo.Id}/{(snapshot.Current.StartedTodoId == todo.Id ? "pause" : "start")}", new { });
        });
        complete = Button("完成", async () =>
        {
            if (snapshot?.Current.Next is not Todo todo) return;
            await Mutate("POST", $"api/todos/{todo.Id}/{(todo.Kind == "ongoing" ? "record" : "complete")}", new { });
        });
        actions.Children.Add(start); actions.Children.Add(complete); actions.Children.Add(save);
        taskPanel.Children.Add(actions);
        panel.Children.Add(taskPanel);

        emptyPanel = new StackPanel { Spacing = 8 };
        newTitle = new TextBox { PlaceholderText = "写下接下来想做的事", MaxLength = 160 };
        emptyPanel.Children.Add(newTitle);
        add = Button("添加到其他事项", async () =>
        {
            if (snapshot == null || string.IsNullOrWhiteSpace(newTitle.Text)) return;
            var ok = await Mutate("POST", "api/todos", new { stateId = snapshot.Current.Id, title = newTitle.Text.Trim() });
            if (ok) newTitle.Text = "";
        });
        emptyPanel.Children.Add(add); panel.Children.Add(emptyPanel);

        choices = new ComboBox { PlaceholderText = "换一件", HorizontalAlignment = HorizontalAlignment.Stretch };
        choices.SelectionChanged += async (_, _) =>
        {
            if (rendering || choices.SelectedItem is not ComboBoxItem item) return;
            await Mutate("POST", $"api/todos/{item.Tag}/priority", new { });
        };
        panel.Children.Add(choices);
        var footer = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        open = Button("打开驾驶舱 ↗", async () => await Run(async () => { await Client.Open(); }));
        launch = Button("启动所往", async () => await Run(async () =>
        {
            Client.Launch(); message = "正在启动…"; Render();
            // Only an explicit click starts an installed app. Polling never starts services.
            for (var i = 0; i < 8; i++)
            {
                await Task.Delay(750);
                try { snapshot = await Client.Read(); message = ""; return; }
                catch (Exception e) when (e is IOException or ArgumentException or HttpRequestException or TaskCanceledException) { }
            }
            throw new IOException("启动尚未完成，请稍后重试。");
        }));
        retry = Button("重试", Refresh);
        footer.Children.Add(open); footer.Children.Add(launch); footer.Children.Add(retry); panel.Children.Add(footer);
        status = Text("", 11); status.Opacity = .7; panel.Children.Add(status);
        Render();
        return new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    }
    private Connection Client => connection ??= new Connection();
    private Task Refresh() => Run(async () => { snapshot = await Client.Read(); message = ""; });
    private async Task<bool> Mutate(string method, string path, object body)
    {
        var success = false;
        await Run(async () =>
        {
            snapshot = await Client.Send(method, path, body);
            editing = false; message = "已保存"; success = true;
        });
        return success;
    }
    private async Task Run(Func<Task> action)
    {
        if (busy || disposed) return;
        busy = true; Render();
        try { await action(); }
        catch (Exception e)
        {
            snapshot = null;
            message = e is IOException ? e.Message : "暂未连接，请启动所往或重试。";
        }
        finally { busy = false; if (!disposed) Render(); }
    }
    private void Render()
    {
        rendering = true;
        try
        {
            var mode = snapshot?.Current; var todo = mode?.Next;
            if (preview != null)
            {
                preview.Text = snapshot == null ? "所往 · 未连接" : todo == null ? "所往 · 写下下一步"
                    : $"{(mode!.StartedTodoId == todo.Id ? "▶ " : "")}{(string.IsNullOrWhiteSpace(todo.MinimalStep) ? todo.Title : todo.MinimalStep)}";
                ToolTipService.SetToolTip(preview, snapshot == null ? "点击连接所往" : todo?.Title ?? "写下接下来想做的事");
            }
            if (title == null || modes == null) return;
            title.Text = snapshot == null ? "连接所往" : todo?.Title ?? "接下来想做什么？";
            context!.Text = mode == null ? "随手接续下一步" : $"{mode.Name} · {mode.Context}";
            modes.SelectedItem = modes.Items.OfType<ComboBoxItem>().FirstOrDefault(i => (string)i.Tag == mode?.Id);
            taskPanel!.Visibility = todo == null ? Visibility.Collapsed : Visibility.Visible;
            emptyPanel!.Visibility = snapshot != null && todo == null ? Visibility.Visible : Visibility.Collapsed;
            if (todo != null && (!editing || editId != todo.Id))
            {
                step!.Text = todo.MinimalStep; editId = todo.Id; editing = false;
            }
            start!.Content = todo != null && mode?.StartedTodoId == todo.Id ? "暂停" : "开始这一步";
            complete!.Content = todo?.Kind == "ongoing" ? "今天完成" : "完成";
            choices!.Items.Clear();
            foreach (var t in mode?.Choices ?? []) choices.Items.Add(new ComboBoxItem { Tag = t.Id, Content = t.Title });
            choices.SelectedIndex = -1;
            choices.Visibility = mode?.Choices.Any() == true ? Visibility.Visible : Visibility.Collapsed;
            foreach (var control in new Control?[] { modes, choices, start, complete, save, add, step, newTitle, open })
                if (control != null) control.IsEnabled = !busy && snapshot != null;
            launch!.Visibility = snapshot == null ? Visibility.Visible : Visibility.Collapsed;
            retry!.Visibility = snapshot == null ? Visibility.Visible : Visibility.Collapsed;
            open!.Visibility = snapshot == null ? Visibility.Collapsed : Visibility.Visible;
            launch.IsEnabled = retry.IsEnabled = !busy;
            status!.Text = busy ? "正在连接…" : message;
        }
        finally { rendering = false; }
    }
    public async void OnFlyoutShown() { timer.Interval = TimeSpan.FromSeconds(5); await Refresh(); }
    public void OnFlyoutHidden() { timer.Interval = TimeSpan.FromSeconds(15); }
    public override ValueTask DisposeAsync()
    {
        disposed = true; timer.Stop(); connection?.Dispose(); return ValueTask.CompletedTask;
    }
}
