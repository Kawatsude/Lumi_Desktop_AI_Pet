@echo off
echo Lumi baslatiliyor...
echo Eger eksik paket varsa indirilecek.
call npm install electron --save-dev
echo Electron aciliyor...
call npx electron .
pause
