@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\" (
    echo [1/2] node_modules가 없습니다. npm install을 실행합니다...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install 실패. 종료합니다.
        pause
        exit /b 1
    )
) else (
    echo [1/2] node_modules가 이미 존재합니다. npm install을 건너뜁니다.
)

echo.
echo [2/2] 개발 서버를 실행하고 브라우저를 엽니다...
call npm run dev -- --open
