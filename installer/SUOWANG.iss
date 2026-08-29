#define AppName "所往 SUOWANG"
#ifndef AppVersion
  #define AppVersion "0.1.1"
#endif
#define PortableName "SUOWANG-Portable-" + AppVersion
#define AppExe "SUOWANG.exe"

[Setup]
AppId={{65D34BEA-B5D2-42E8-BF6C-44AB2B7E309A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=SUOWANG
AppPublisherURL=https://github.com/xhonye/suowang
DefaultDirName={localappdata}\Programs\SUOWANG
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist\windows
OutputBaseFilename=SUOWANG-Setup-{#AppVersion}
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
Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Description: "立即打开所往 SUOWANG"; Flags: nowait postinstall skipifsilent
