#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
    echo "[1/2] node_modules가 없습니다. npm install을 실행합니다..."
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "npm install 실패. 종료합니다."
        read -n 1 -s -r -p "아무 키나 눌러 종료..."
        exit 1
    fi
else
    echo "[1/2] node_modules가 이미 존재합니다. npm install을 건너뜁니다."
fi

echo ""
echo "[2/2] 개발 서버를 실행하고 브라우저를 엽니다..."
npm run dev -- --open
