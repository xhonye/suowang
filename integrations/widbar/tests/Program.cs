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
}
Console.WriteLine($"{count} checks passed");
