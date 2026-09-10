using Suowang.Widget;

var count = 0;
void Check(bool ok, string label) { if (!ok) throw new Exception(label); Console.WriteLine($"PASS {label}"); count++; }
var ports = Connection.PortsForPid(" TCP 127.0.0.1:4181 0.0.0.0:0 LISTENING 42\n TCP 0.0.0.0:2037 0.0.0.0:0 LISTENING 42\n TCP 127.0.0.1:2037 0.0.0.0:0 LISTENING 99\n TCP 127.0.0.1:1111 127.0.0.1:2222 ESTABLISHED 42", 42).ToArray();
Check(ports.SequenceEqual(new[] { 4181 }), "Discovery only accepts loopback listener belonging to lock PID");
var a = new Todo("a", "A", "small", "single", false);
var b = new Todo("b", "B", "", "ongoing", true);
var c = new Todo("c", "C", "", "single", false);
var mode = new Mode("work", "工作", "m", "a", null,
    [new("m", "Mainline", [a, b]), new("other", "Other", [c])], []);
Check(mode.Choices.SequenceEqual(new[] { a }), "Choices exclude other mainlines and today's completed ongoing items");
Check(mode.Next == a && mode.Context == "Mainline", "Current pointer selects exact item and context");
Check((mode with { PriorityTodoId = "missing" }).Next == null, "Missing pointer never guesses a replacement");
Check((mode with { PriorityTodoId = "b" }).Next == null, "Completed-today item cannot be offered as next step");
var slots = mode with { Mainlines = [new("third", "Third", [c], 3), new("first", "First", [a], 1)], CurrentMainlineId = "first" };
Check(slots.MainlineAt(1)?.Id == "first" && slots.MainlineAt(3)?.Id == "third", "Mainline slots follow native slotIndex rather than array order");
Check(slots.MainlineAt(2) == null, "Empty mainline slot stays empty");
Check(slots.CurrentMainline?.Id == "first", "Displayed mainline follows confirmed current pointer");
var draft = new StepDraft();
draft.Bind(a);
Check(!draft.IsDirty && draft.Id == a.Id, "Opening an item does not create an unsaved edit");
draft.Edit("A smaller first step");
draft.Bind(a);
Check(draft.IsDirty && draft.Text == "A smaller first step", "Refresh keeps the unsaved text");
draft.Bind(null);
Check(draft.IsDirty && draft.Id == a.Id, "Disconnect keeps the edit attached to the original item");
draft.Bind(c);
Check(draft.Id == a.Id && draft.Title == a.Title, "An external next-step change cannot retarget an edit");
draft.Cancel(c);
Check(!draft.IsDirty && draft.Id == c.Id && draft.Text == c.MinimalStep, "Explicit cancel adopts the current item");
draft.Bind(a); draft.Edit("");
Check(draft.IsDirty, "Clearing an existing minimal step is an edit");
draft.Edit(a.MinimalStep);
Check(!draft.IsDirty, "Returning to the original text removes the dirty state");
draft.Edit("Saved step"); draft.Accept(); draft.Bind(c);
Check(!draft.IsDirty && draft.Id == c.Id, "Acknowledged save releases the original edit");
if (args.Length == 1)
{
    // Only an explicit temporary directory supplied by the smoke runner is allowed.
    if (!Path.GetFullPath(args[0]).StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)) throw new Exception("Temporary fixture required");
    using var client = new Connection(args[0]);
    var snap = await client.Read();
    Check(snap.States.Count == 3, "Connect to real temporary SUOWANG service by lock PID");
    snap = await client.Send("PATCH", "api/app-state", new { lastViewedStateId = "life" });
    Check(snap.Current.Id == "life", "Mode switch persists");
    snap = await client.Send("POST", "api/todos", new { stateId = "life", title = "Widget smoke", minimalStep = "Find a ruler" });
    var id = snap.Current.Next!.Id;
    snap = await client.Send("PATCH", $"api/todos/{id}", new { minimalStep = "Pick up a ruler" });
    Check(snap.Current.Next!.MinimalStep == "Pick up a ruler", "Minimal step saves through existing API");
    draft.Bind(snap.Current.Next); draft.Edit(new string('x', 161));
    var rejected = false;
    try { await client.Send("PATCH", $"api/todos/{draft.Id}", new { minimalStep = draft.Text }); }
    catch (IOException) { rejected = true; }
    Check(rejected && draft.IsDirty && draft.Text.Length == 161, "Rejected save retains the edit for correction");
    draft.Edit("Hold the ruler");
    snap = await client.Send("PATCH", $"api/todos/{draft.Id}", new { minimalStep = draft.Text });
    draft.Accept(); draft.Bind(snap.Current.Next);
    Check(!draft.IsDirty && draft.Text == "Hold the ruler", "Corrected edit can be saved against the real service");
    snap = await client.Send("POST", $"api/todos/{id}/start", new { });
    Check(snap.Current.StartedTodoId == id, "Start persists");
    snap = await client.Send("POST", $"api/todos/{id}/pause", new { });
    Check(snap.Current.StartedTodoId == null && snap.Current.Next?.Id == id, "Pause preserves item");
    snap = await client.Send("POST", $"api/todos/{id}/complete", new { });
    Check(snap.Current.Next == null, "Complete removes next pointer");
    snap = await client.Send("POST", "api/todos", new { stateId = "life", title = "Ongoing smoke", kind = "ongoing" });
    var ongoing = snap.Current.Next!.Id;
    snap = await client.Send("POST", $"api/todos/{ongoing}/record", new { });
    Check(snap.Current.Next == null && snap.Current.StateTodos.Any(t => t.Id == ongoing && t.CompletedToday), "Ongoing completes today without ending item");
    snap = await client.Send("PATCH", "api/app-state", new { lastViewedStateId = "work" });
    for (var slot = 1; slot <= 3; slot++)
        if (snap.Current.MainlineAt(slot) == null)
            snap = await client.Send("POST", "api/mainlines", new { stateId = "work", name = $"Widget mainline {slot}", slotIndex = slot });
    var first = snap.Current.MainlineAt(1)!.Id;
    var second = snap.Current.MainlineAt(2)!.Id;
    Check(snap.Current.MainlineAt(3) != null, "All three native mainline slots deserialize");
    snap = await client.Send("POST", $"api/mainlines/{first}/current", new { });
    Check(snap.Current.CurrentMainlineId == first && snap.Current.StartedTodoId == null, "Mainline selection persists without starting");
    snap = await client.Send("POST", "api/todos", new { stateId = "work", mainlineId = first, title = "Selector A" });
    var selectorA = snap.Current.CurrentMainline!.Todos.Single(t => t.Title == "Selector A").Id;
    snap = await client.Send("POST", "api/todos", new { stateId = "work", mainlineId = first, title = "Selector B" });
    var selectorB = snap.Current.CurrentMainline!.Todos.Single(t => t.Title == "Selector B").Id;
    snap = await client.Send("POST", $"api/todos/{selectorA}/priority", new { });
    snap = await client.Send("POST", $"api/todos/{selectorA}/start", new { });
    snap = await client.Send("POST", $"api/todos/{selectorB}/priority", new { });
    Check(snap.Current.Next?.Id == selectorB && snap.Current.StartedTodoId == null, "Selecting another item stops old running pointer without auto-start");
    snap = await client.Send("POST", $"api/todos/{selectorB}/start", new { });
    Check(snap.Current.StartedTodoId == selectorB, "Preview start targets the newly selected item");
    snap = await client.Send("POST", $"api/todos/{selectorB}/pause", new { });
    Check(snap.Current.Next?.Id == selectorB && snap.Current.StartedTodoId == null, "Preview pause preserves selected item");
    snap = await client.Send("POST", $"api/mainlines/{second}/current", new { });
    Check(snap.Current.CurrentMainlineId == second && !snap.Current.Choices.Any(t => t.Id == selectorB), "Changing mainline replaces eligible item list");
    var wrongMainlineRejected = false;
    try { await client.Send("POST", $"api/todos/{selectorB}/priority", new { }); }
    catch (IOException) { wrongMainlineRejected = true; }
    Check(wrongMainlineRejected, "Old mainline item cannot be selected from stale UI");
}
Console.WriteLine($"{count} checks passed");
