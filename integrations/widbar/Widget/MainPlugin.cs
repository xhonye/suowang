using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using WidBar.SDK;

namespace Suowang.Widget;

public sealed class MainPlugin : WidgetPluginBase, IWidgetFlyoutLifecycle
{
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(3) };
    private Connection? connection;
    private Snapshot? snapshot;
    private bool busy, refreshing, disposed;
    private int actionRevision;
    private TextBlock? preview, status;
    private Button? previewToggle;
    private IWidgetContext? widgetContext;
    private readonly Dictionary<string, Button> modeButtons = new();
    private readonly Dictionary<int, Button> mainlineButtons = new();
    private readonly Dictionary<string, Button> todoButtons = new();
    private StackPanel? todoList;
    private string? todoListKey;
    private Button? launch, retry, open;
    private string message = "点击连接所往";

    public override string Id => "com.suowang.nextstep";
    public override string Name => "所往 · 下一步";
    public override int PreviewLogicalWidth => 144;
    public override int FlyoutWidth => 320;
    public override int FlyoutHeight => 360;
    public override WidgetFlyoutBackdrop FlyoutBackdrop => WidgetFlyoutBackdrop.Mica;

    public override async Task InitializeAsync(IWidgetContext context)
    {
        widgetContext = context;
        timer.Tick += async (_, _) => await Refresh();
        timer.Start();
        await Refresh();
    }
    private static TextBlock Text(string value, double size = 12) => new()
        { Text = value, FontSize = size, TextWrapping = TextWrapping.Wrap };
    private static Button Button(string text, Func<Task> action)
    {
        var button = new Button { Content = text, FontSize = 12, MinHeight = 36, Padding = new Thickness(12, 6, 12, 6) };
        button.Click += async (_, _) => await action();
        return button;
    }
    public override UIElement CreatePreviewContent()
    {
        preview = new TextBlock { FontSize = 11, TextWrapping = TextWrapping.Wrap, MaxLines = 2,
            RenderTransform = new TranslateTransform { Y = 0 },
            TextAlignment = TextAlignment.Center,
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center };
        var panel = new Grid { Width = PreviewLogicalWidth, ColumnSpacing = 4,
            VerticalAlignment = VerticalAlignment.Center, Padding = new Thickness(8, 0, 8, 0) };
        panel.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var details = new Button { Content = preview, Padding = new Thickness(0), MinWidth = 0,
            HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch,
            BorderThickness = new Thickness(0), Background = new SolidColorBrush(Windows.UI.Color.FromArgb(0, 0, 0, 0)) };
        details.Click += (_, _) => widgetContext?.RequestOpenFlyout();
        details.Tapped += (_, args) => args.Handled = true;
        panel.Children.Add(details);
        panel.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        previewToggle = new Button { Width = 28, Height = 28, MinWidth = 28, MinHeight = 28,
            Padding = new Thickness(0), CornerRadius = new CornerRadius(6), BorderThickness = new Thickness(0),
            Background = new SolidColorBrush(Windows.UI.Color.FromArgb(0, 0, 0, 0)),
            VerticalAlignment = VerticalAlignment.Center };
        previewToggle.Click += async (_, _) => await ToggleStarted();
        previewToggle.Tapped += (_, args) => args.Handled = true;
        Grid.SetColumn(previewToggle, 1); panel.Children.Add(previewToggle);
        Render();
        return panel;
    }
    public override UIElement CreateFlyoutContent()
    {
        var navigation = new StackPanel { Spacing = 6 };
        var modeRow = ThreeColumns();
        var modeIndex = 0;
        foreach (var (id, name) in new[] { ("restore", "恢复"), ("work", "工作"), ("life", "生活") })
        {
            var button = SelectorButton(name, () => SelectMode(id));
            modeButtons.Add(id, button);
            Grid.SetColumn(button, modeIndex++); modeRow.Children.Add(button);
        }
        navigation.Children.Add(modeRow);
        var mainlineRow = ThreeColumns();
        for (var slot = 1; slot <= 3; slot++)
        {
            var slotIndex = slot;
            var button = SelectorButton("空位", () => SelectMainline(slotIndex));
            mainlineButtons.Add(slotIndex, button);
            Grid.SetColumn(button, slot - 1); mainlineRow.Children.Add(button);
        }
        navigation.Children.Add(mainlineRow);
        todoList = new StackPanel { Spacing = 6 };
        var footer = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        open = Button("所往 ↗", async () => await Run(async () => { await Client.Open(); }));
        open.FontSize = 12; open.Padding = new Thickness(0, 4, 0, 4);
        open.BorderThickness = new Thickness(0);
        open.Background = new SolidColorBrush(Windows.UI.Color.FromArgb(0, 0, 0, 0));
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
        footer.Children.Add(open); footer.Children.Add(launch); footer.Children.Add(retry);
        status = Text("", 12); status.Opacity = .8;
        var bottom = new StackPanel { Spacing = 6 }; bottom.Children.Add(footer); bottom.Children.Add(status);
        var layout = new Grid { Padding = new Thickness(16), RowSpacing = 6, MaxHeight = FlyoutHeight };
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        layout.Children.Add(navigation);
        var listScroll = new ScrollViewer { Content = todoList, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        Grid.SetRow(listScroll, 1); layout.Children.Add(listScroll);
        Grid.SetRow(bottom, 2); layout.Children.Add(bottom);
        Render();
        return layout;
    }
    private static Grid ThreeColumns()
    {
        var grid = new Grid { ColumnSpacing = 6 };
        for (var index = 0; index < 3; index++)
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        return grid;
    }

    private static Button SelectorButton(string label, Func<Task> action)
    {
        var button = Button(label, action);
        button.Content = new TextBlock
        {
            Text = label, FontSize = 12, MaxLines = 2, TextWrapping = TextWrapping.Wrap,
            TextTrimming = TextTrimming.CharacterEllipsis, TextAlignment = TextAlignment.Center,
        };
        AddTruncatedTitleHint(button);
        button.MinWidth = 0; button.Padding = new Thickness(5, 6, 5, 6);
        button.HorizontalAlignment = HorizontalAlignment.Stretch;
        button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        return button;
    }

    private static void SelectionStyle(Button button, bool selected)
    {
        if (button.Tag is bool previous && previous == selected) return;
        button.Tag = selected;
        button.Background = new SolidColorBrush(Windows.UI.Color.FromArgb(selected ? (byte)255 : (byte)0, 78, 131, 156));
        button.BorderBrush = new SolidColorBrush(Windows.UI.Color.FromArgb(selected ? (byte)180 : (byte)40, 78, 131, 156));
        button.Foreground = selected ? new SolidColorBrush(Microsoft.UI.Colors.White)
            : (Brush)Application.Current.Resources["TextFillColorPrimaryBrush"];
        foreach (var state in new[] { "PointerOver", "Pressed" })
        {
            button.Resources["ButtonBackground" + state] = button.Background;
            button.Resources["ButtonForeground" + state] = button.Foreground;
            button.Resources["ButtonBorderBrush" + state] = button.BorderBrush;
        }
        button.BorderThickness = new Thickness(1);
        button.CornerRadius = new CornerRadius(6);
    }

    private async Task SelectMode(string id)
    {
        if (busy || snapshot == null || snapshot.Current.Id == id) return;
        await Mutate("PATCH", "api/app-state", new { lastViewedStateId = id });
    }

    private async Task SelectMainline(int slot)
    {
        if (busy || snapshot?.Current.MainlineAt(slot) is not { } mainline ||
            mainline.Id == snapshot.Current.CurrentMainlineId) return;
        await Mutate("POST", $"api/mainlines/{Uri.EscapeDataString(mainline.Id)}/current", new { });
    }

    private async Task SelectTodo(string id)
    {
        if (busy || snapshot == null || snapshot.Current.PriorityTodoId == id ||
            !snapshot.Current.Choices.Any(todo => todo.Id == id)) return;
        await Mutate("POST", $"api/todos/{Uri.EscapeDataString(id)}/priority", new { });
    }

    private void RenderNavigation(Mode? mode)
    {
        foreach (var pair in modeButtons)
        {
            var label = pair.Key == "restore" ? "恢复" : pair.Key == "work" ? "工作" : "生活";
            var selected = pair.Key == mode?.Id;
            ((TextBlock)pair.Value.Content).Text = label;
            SelectionStyle(pair.Value, selected);
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(pair.Value, label + "模式" + (selected ? "，当前" : ""));
        }
        foreach (var pair in mainlineButtons)
        {
            var mainline = mode?.MainlineAt(pair.Key);
            var selected = mainline != null && mainline.Id == mode!.CurrentMainlineId;
            ((TextBlock)pair.Value.Content).Text = mainline == null ? "空位" : mainline.Name;
            SelectionStyle(pair.Value, selected);

            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(pair.Value,
                $"主线 {pair.Key}：{mainline?.Name ?? "空位"}" + (selected ? "，当前" : ""));
        }
        var mainlineTodos = mode?.CurrentMainline?.Todos ?? [];
        var stateTodos = mode?.StateTodos ?? [];
        var key = System.Text.Json.JsonSerializer.Serialize(new { mode = mode?.Id, mainline = mode?.CurrentMainlineId, mainlineTodos, stateTodos });
        if (key != todoListKey)
        {
            todoListKey = key;
            todoList!.Children.Clear(); todoButtons.Clear();
            if (mode == null) todoList.Children.Add(Text("尚未连接", 13));
            else if (mainlineTodos.Count == 0)
                todoList.Children.Add(Text(mode.CurrentMainline == null ? "选择主线" : "暂无事项", 12));
            foreach (var todo in mainlineTodos) AddTodoRow(todo);
            if (stateTodos.Count > 0)
            {
                var label = Text("其他事项", 11); label.Opacity = .6; label.Margin = new Thickness(0, 6, 0, 0);
                todoList.Children.Add(label);
                foreach (var todo in stateTodos) AddTodoRow(todo);
            }
        }
        foreach (var todo in mainlineTodos.Concat(stateTodos))
        {
            var selected = todo.Id == mode?.PriorityTodoId;
            var running = selected && todo.Id == mode?.StartedTodoId;
            var button = todoButtons[todo.Id];
            SelectionStyle(button, selected);
            var state = todo.CompletedToday ? "，今天已完成" : running ? "，当前事项，进行中" : selected ? "，当前事项" : "，点击设为当前事项";
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(button, todo.Title + state);
        }
        UpdateSelectionEnabled();
    }

    private void AddTodoRow(Todo todo)
    {
        var button = Button("", () => SelectTodo(todo.Id));
        button.HorizontalAlignment = HorizontalAlignment.Stretch;
        button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        button.Padding = new Thickness(10, 8, 10, 8);
        var titleText = Text(todo.Title); titleText.MaxLines = 2;
        titleText.TextTrimming = TextTrimming.CharacterEllipsis;
        button.Content = titleText;
        AddTruncatedTitleHint(button);
        todoButtons.Add(todo.Id, button);
        todoList!.Children.Add(button);
    }

    private static void AddTruncatedTitleHint(Button button)
    {
        button.PointerEntered += (_, _) =>
        {
            if (button.Content is TextBlock label)
                ToolTipService.SetToolTip(button, label.IsTextTrimmed ? label.Text : null);
        };
    }

    private void UpdateSelectionEnabled()
    {
        var available = !busy && snapshot != null;
        foreach (var button in modeButtons.Values) button.IsEnabled = available;
        foreach (var pair in mainlineButtons) pair.Value.IsEnabled = available && snapshot!.Current.MainlineAt(pair.Key) != null;
        var eligible = snapshot?.Current.Choices.Select(todo => todo.Id).ToHashSet() ?? [];
        foreach (var pair in todoButtons) pair.Value.IsEnabled = available && eligible.Contains(pair.Key);
    }

    private Connection Client => connection ??= new Connection();
    private async Task ToggleStarted()
    {
        if (busy || snapshot?.Current.Next is not Todo todo) return;
        await Mutate("POST", $"api/todos/{Uri.EscapeDataString(todo.Id)}/{(snapshot.Current.StartedTodoId == todo.Id ? "pause" : "start")}", new { });
    }
    private Task Refresh() => RefreshFrom(() => Client.Read());

    // Background reads must not toggle command progress or interrupt an in-flight
    // user action. A read started before that action cannot replace its result.
    internal async Task RefreshFrom(Func<Task<Snapshot>> read)
    {
        if (busy || refreshing || disposed) return;
        refreshing = true;
        var revision = actionRevision;
        try
        {
            var next = await read();
            if (disposed || revision != actionRevision) return;
            var changed = snapshot == null || System.Text.Json.JsonSerializer.Serialize(snapshot)
                != System.Text.Json.JsonSerializer.Serialize(next) || message != "";
            snapshot = next; message = "";
            if (changed) Render();
        }
        catch (Exception e)
        {
            if (disposed || revision != actionRevision) return;
            var error = e is IOException ? e.Message : "暂未连接，请启动所往或重试。";
            var changed = snapshot != null || message != error;
            snapshot = null; message = error;
            if (changed) Render();
        }
        finally { refreshing = false; }
    }
    private async Task<bool> Mutate(string method, string path, object body)
    {
        var success = false;
        await Run(async () =>
        {
            snapshot = await Client.Send(method, path, body);
            message = ""; success = true;
        });
        return success;
    }
    private async Task Run(Func<Task> action)
    {
        if (busy || disposed) return;
        actionRevision++;
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
        var mode = snapshot?.Current; var todo = mode?.Next;
        var running = todo != null && mode?.StartedTodoId == todo.Id;
        if (previewToggle != null)
        {
            if (previewToggle.Content is not FontIcon)
                previewToggle.Content = new FontIcon { FontSize = 14,
                    Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 78, 131, 156)) };
            ((FontIcon)previewToggle.Content).Glyph = running ? "\uE769" : "\uE768";
            previewToggle.IsEnabled = !busy && todo != null;
            var actionLabel = todo == null ? "暂无可开始的事项" : running ? "进行中 · 点击暂停" : "暂停中 · 点击开始或继续";
            ToolTipService.SetToolTip(previewToggle, actionLabel);
            Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(previewToggle, actionLabel);
        }
        if (preview != null)
        {
            preview.Text = snapshot == null ? "所往 · 未连接" : todo == null ? "所往 · 选择事项" : todo.Title;
            ToolTipService.SetToolTip(preview, snapshot == null ? "点击连接所往" : todo == null ? "选择接下来想做的事"
                : $"{mode!.Name} · {(running ? "正在进行" : "当前事项")}\n{todo.Title}");
        }
        if (todoList == null) return;
        RenderNavigation(mode);
        launch!.Visibility = retry!.Visibility = snapshot == null ? Visibility.Visible : Visibility.Collapsed;
        open!.Visibility = snapshot == null ? Visibility.Collapsed : Visibility.Visible;
        launch.IsEnabled = retry.IsEnabled = !busy;
        open.IsEnabled = !busy && snapshot != null;
        status!.Text = message;
        status.Visibility = string.IsNullOrEmpty(status.Text) ? Visibility.Collapsed : Visibility.Visible;
    }
    public async void OnFlyoutShown() { await Refresh(); }
    public void OnFlyoutHidden() { }
    public override ValueTask DisposeAsync()
    {
        disposed = true; timer.Stop(); connection?.Dispose(); return ValueTask.CompletedTask;
    }
}
