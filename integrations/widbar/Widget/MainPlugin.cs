using Microsoft.UI.Text;
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
    private bool busy, rendering, disposed;
    private readonly StepDraft draft = new();
    private TextBlock? preview, title, context, status, runningLabel;
    private Border? runningBadge;
    private TextBox? step, newTitle;
    private ComboBox? modes, choices;
    private Button? start, complete, save, cancel, add, launch, retry, open;
    private StackPanel? taskPanel, emptyPanel, editActions;
    private string message = "点击连接所往";

    public override string Id => "com.suowang.nextstep";
    public override string Name => "所往 · 下一步";
    public override int PreviewLogicalWidth => 180;
    public override int FlyoutWidth => 340;
    public override int FlyoutHeight => 370;
    public override WidgetFlyoutBackdrop FlyoutBackdrop => WidgetFlyoutBackdrop.Mica;

    public override async Task InitializeAsync(IWidgetContext context)
    {
        timer.Tick += async (_, _) => { if (!draft.IsDirty) await Refresh(); };
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
        preview = new TextBlock { FontSize = 12, TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center };
        var panel = new Grid { Width = PreviewLogicalWidth, ColumnSpacing = 7,
            VerticalAlignment = VerticalAlignment.Center, Padding = new Thickness(8, 0, 8, 0) };
        panel.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        panel.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        panel.Children.Add(new FontIcon { Glyph = "\uE72A", FontSize = 14, Width = 14,
            Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 87, 157, 201)) });
        Grid.SetColumn(preview, 1);
        panel.Children.Add(preview);
        panel.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        runningLabel = Text("执行中", 10);
        runningLabel.FontWeight = FontWeights.SemiBold;
        runningLabel.Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 30, 86, 120));
        runningBadge = new Border { Child = runningLabel, Padding = new Thickness(5, 3, 5, 3),
            CornerRadius = new CornerRadius(4), VerticalAlignment = VerticalAlignment.Center,
            Background = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 203, 230, 248)),
            Visibility = Visibility.Collapsed };
        Grid.SetColumn(runningBadge, 2); panel.Children.Add(runningBadge);
        Render();
        return panel;
    }
    public override UIElement CreateFlyoutContent()
    {
        var panel = new StackPanel { Spacing = 8 };
        modes = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch, PlaceholderText = "选择模式" };
        foreach (var (id, name) in new[] { ("restore", "恢复模式"), ("work", "工作模式"), ("life", "生活模式") })
            modes.Items.Add(new ComboBoxItem { Tag = id, Content = name });
        modes.SelectionChanged += async (_, _) =>
        {
            if (rendering || draft.IsDirty || modes.SelectedItem is not ComboBoxItem selected) return;
            await Mutate("PATCH", "api/app-state", new { lastViewedStateId = (string)selected.Tag });
        };
        panel.Children.Add(modes);
        context = Text("", 12); context.Opacity = .75; context.MaxLines = 1;
        context.TextTrimming = TextTrimming.CharacterEllipsis; panel.Children.Add(context);
        title = Text("下一步", 18); title.FontWeight = FontWeights.SemiBold;
        title.MaxLines = 2; title.TextTrimming = TextTrimming.WordEllipsis; panel.Children.Add(title);

        taskPanel = new StackPanel { Spacing = 10 };
        step = new TextBox { PlaceholderText = "写一个更容易开始的最小一步", MaxLength = 160,
            Header = "最小一步", AcceptsReturn = false };
        step.TextChanged += (_, _) =>
        {
            if (rendering) return;
            draft.Edit(step.Text); UpdateControls();
        };
        taskPanel.Children.Add(step);
        save = Button("保存", async () =>
        {
            if (draft.Id == null || !draft.IsDirty) return;
            await Run(async () =>
            {
                snapshot = await Client.Send("PATCH", $"api/todos/{Uri.EscapeDataString(draft.Id)}", new { minimalStep = draft.Text });
                draft.Accept(); message = "已保存";
            });
            if (draft.IsDirty) step.Focus(FocusState.Programmatic);
            else start?.Focus(FocusState.Programmatic);
        });
        cancel = Button("取消", () =>
        {
            draft.Cancel(snapshot?.Current.Next); message = ""; Render();
            if (snapshot?.Current.Next != null) step.Focus(FocusState.Programmatic);
            return Task.CompletedTask;
        });
        editActions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        editActions.Children.Add(save); editActions.Children.Add(cancel); taskPanel.Children.Add(editActions);
        var actions = new Grid { ColumnSpacing = 8 };
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        actions.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        start = Button("开始这一步", async () =>
        {
            if (draft.IsDirty || snapshot?.Current.Next is not Todo todo) return;
            await Mutate("POST", $"api/todos/{todo.Id}/{(snapshot.Current.StartedTodoId == todo.Id ? "pause" : "start")}", new { });
        });
        complete = Button("完成", async () =>
        {
            if (draft.IsDirty || snapshot?.Current.Next is not Todo todo) return;
            await Mutate("POST", $"api/todos/{todo.Id}/record", new { });
        });
        start.HorizontalAlignment = HorizontalAlignment.Stretch;
        start.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
        Grid.SetColumn(complete, 1);
        actions.Children.Add(start); actions.Children.Add(complete);
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
            if (rendering || draft.IsDirty || choices.SelectedItem is not ComboBoxItem item) return;
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
        footer.Children.Add(open); footer.Children.Add(launch); footer.Children.Add(retry);
        status = Text("", 12); status.Opacity = .8;
        var bottom = new StackPanel { Spacing = 6 }; bottom.Children.Add(footer); bottom.Children.Add(status);
        var layout = new Grid { Padding = new Thickness(16), RowSpacing = 10 };
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        layout.Children.Add(new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Grid.SetRow(bottom, 1); layout.Children.Add(bottom);
        Render();
        return layout;
    }
    private Connection Client => connection ??= new Connection();
    private Task Refresh() => Run(async () => { snapshot = await Client.Read(); message = ""; });
    private async Task<bool> Mutate(string method, string path, object body)
    {
        var success = false;
        await Run(async () =>
        {
            snapshot = await Client.Send(method, path, body);
            message = "已保存"; success = true;
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
            var running = todo != null && mode?.StartedTodoId == todo.Id;
            if (runningBadge != null) runningBadge.Visibility = running ? Visibility.Visible : Visibility.Collapsed;
            if (preview != null)
            {
                preview.Text = snapshot == null ? "所往 · 未连接" : todo == null ? "所往 · 写下下一步"
                    : string.IsNullOrWhiteSpace(todo.MinimalStep) ? todo.Title : todo.MinimalStep;
                ToolTipService.SetToolTip(preview, snapshot == null ? "点击连接所往" : todo == null ? "写下接下来想做的事"
                    : $"{mode!.Name} · {(mode.StartedTodoId == todo.Id ? "正在进行" : "下一步")}\n{todo.Title}{(string.IsNullOrWhiteSpace(todo.MinimalStep) ? "" : $"\n{todo.MinimalStep}")}");
            }
            if (title == null || modes == null) return;
            draft.Bind(todo);
            title.Text = draft.IsDirty ? draft.Title : snapshot == null ? "连接所往" : todo?.Title ?? "接下来想做什么？";
            ToolTipService.SetToolTip(title, title.Text);
            context!.Text = draft.IsDirty && todo?.Id != draft.Id ? "未保存的编辑 · 原事项"
                : mode == null ? "随手接续下一步" : $"{(running ? "▶ 执行中 · " : "")}{mode.Name} · {mode.Context}";
            modes.SelectedItem = modes.Items.OfType<ComboBoxItem>().FirstOrDefault(i => (string)i.Tag == mode?.Id);
            taskPanel!.Visibility = todo != null || draft.IsDirty ? Visibility.Visible : Visibility.Collapsed;
            emptyPanel!.Visibility = snapshot != null && todo == null && !draft.IsDirty ? Visibility.Visible : Visibility.Collapsed;
            if (step!.Text != draft.Text) step.Text = draft.Text;
            start!.Content = todo != null && mode?.StartedTodoId == todo.Id ? "暂停" : "开始这一步";
            complete!.Content = "今天完成";
            choices!.Items.Clear();
            foreach (var t in mode?.Choices ?? []) choices.Items.Add(new ComboBoxItem { Tag = t.Id, Content = t.Title });
            choices.SelectedIndex = -1;
            choices.Visibility = mode?.Choices.Any() == true ? Visibility.Visible : Visibility.Collapsed;
            launch!.Visibility = snapshot == null ? Visibility.Visible : Visibility.Collapsed;
            retry!.Visibility = snapshot == null ? Visibility.Visible : Visibility.Collapsed;
            open!.Visibility = snapshot == null ? Visibility.Collapsed : Visibility.Visible;
            launch.IsEnabled = retry.IsEnabled = !busy;
            UpdateControls();
        }
        finally { rendering = false; }
    }
    private void UpdateControls()
    {
        if (editActions == null || status == null) return;
        editActions.Visibility = draft.IsDirty ? Visibility.Visible : Visibility.Collapsed;
        foreach (var control in new Control?[] { modes, choices, start, complete, add, newTitle })
            if (control != null) control.IsEnabled = !busy && snapshot != null && !draft.IsDirty;
        step!.IsEnabled = !busy && (snapshot?.Current.Next != null || draft.IsDirty);
        save!.IsEnabled = !busy && draft.IsDirty && snapshot != null;
        cancel!.IsEnabled = !busy;
        open!.IsEnabled = !busy && snapshot != null;
        status.Text = busy ? "正在处理…" : draft.IsDirty
            ? snapshot == null ? $"{message} 编辑仍保留。" : "有未保存的编辑，请先保存或取消。"
            : message;
    }
    public async void OnFlyoutShown() { await Refresh(); }
    public void OnFlyoutHidden() { }
    public override ValueTask DisposeAsync()
    {
        disposed = true; timer.Stop(); connection?.Dispose(); return ValueTask.CompletedTask;
    }
}
