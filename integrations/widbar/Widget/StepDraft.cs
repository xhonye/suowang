namespace Suowang.Widget;

// An unsaved edit stays attached to its original item, even after a refresh or disconnect.
public sealed class StepDraft
{
    public string? Id { get; private set; }
    public string Title { get; private set; } = "";
    public string Text { get; private set; } = "";
    private string saved = "";
    public bool IsDirty => Id != null && Text != saved;

    public void Bind(Todo? todo)
    {
        if (IsDirty) return;
        Id = todo?.Id;
        Title = todo?.Title ?? "";
        Text = saved = todo?.MinimalStep ?? "";
    }
    public void Edit(string text) => Text = text;
    public void Accept() => saved = Text;
    public void Cancel(Todo? current) { saved = Text; Bind(current); }
}
