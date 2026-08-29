#define AppName "所往 SUOWANG（轻量版）"
#ifndef AppVersion
  #define AppVersion "0.2.0-beta.3"
#endif
#define PortableName "SUOWANG-Lite-Portable-" + AppVersion
#define AppExe "SUOWANG-Lite.exe"

[Setup]
AppId={{43D37C7B-85BD-4690-B31A-9F468B06BE90}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=SUOWANG
AppPublisherURL=https://github.com/xhonye/suowang
DefaultDirName={localappdata}\Programs\SUOWANG Lite
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist\windows
OutputBaseFilename=SUOWANG-Lite-Setup-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
SetupIconFile=..\assets\brand\suowang-app-icon.ico
UninstallDisplayIcon={app}\{#AppExe}
CloseApplications=yes
CloseApplicationsFilter={#AppExe}
RestartApplications=no

[Files]
Source: "..\dist\windows\{#PortableName}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\{#AppExe}"
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\{#AppExe}"
Name: "{group}\卸载 {#AppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Description: "立即在浏览器中打开所往"; Flags: nowait postinstall skipifsilent
