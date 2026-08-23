@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 goto :missing_node

for /f %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 22 goto :old_node

where npm.cmd >nul 2>nul
if errorlevel 1 goto :missing_npm

echo Installing SUOWANG dependencies...
call npm.cmd install --omit=dev --no-audit --no-fund
if errorlevel 1 goto :install_failed

echo Creating the SUOWANG desktop shortcut...
call npm.cmd run install-shortcut
if errorlevel 1 goto :install_failed

echo SUOWANG is ready. Opening it now...
start "" "%~dp0SUOWANG.cmd"
exit /b 0

:missing_node
echo SUOWANG needs Node.js 22 or newer.
echo Install the LTS version from https://nodejs.org/ and double-click INSTALL.cmd again.
goto :failed

:old_node
echo SUOWANG needs Node.js 22 or newer. Current major version: %NODE_MAJOR%
echo Update Node.js from https://nodejs.org/ and double-click INSTALL.cmd again.
goto :failed

:missing_npm
echo npm was not found. Reinstall Node.js 22 or newer with npm included.
goto :failed

:install_failed
echo SUOWANG installation did not complete. Review the error above and try again.

:failed
pause
exit /b 1
