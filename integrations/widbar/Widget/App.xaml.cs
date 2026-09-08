using WidBar.SDK;
using WidBar.SDK.Hosting;
namespace Suowang.Widget;
public partial class App : WidgetHostApplication
{
    public App() => InitializeComponent();
    protected override IWidgetPlugin CreatePlugin() => new MainPlugin();
}
