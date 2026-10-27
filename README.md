# JYTODO — Windows 투두리스트 프로그램

우선 Windows PC용 프로그램으로 개발합니다. 모바일 앱은 추후 범위입니다. Electron 전용 창에서 실행하며, 사용자가 별도로 브라우저나 Node.js 서버를 실행할 필요가 없습니다.

## GitHub 다운로드

[최신 릴리스](https://github.com/heetae1120/JYTODO/releases/latest)의 **Assets**에서 Windows 실행 파일 또는 ZIP을 받으세요. 첫 빌드가 진행 중이면 [Windows 빌드 진행 상황](https://github.com/heetae1120/JYTODO/actions/workflows/release.yml)을 확인할 수 있습니다. 빌드와 테스트가 성공해야 다운로드 파일이 릴리스에 첨부됩니다.

`v*` 태그를 올리면 GitHub Actions가 Windows에서 테스트·빌드하고 GitHub Releases에 실행 파일, ZIP, SHA256SUMS를 게시합니다. 수동 실행은 Actions의 Run workflow에서 가능하며, 태그가 아닌 브랜치에서 실행하면 Actions 아티팩트만 생성합니다. GitHub Actions에는 저장소 기본 토큰만 사용하며 개인 토큰이나 연동 키를 등록할 필요가 없습니다.

## Windows 설치·실행

`release/`에 생성되는 두 배포물 중 하나를 사용합니다.

- **JYTODO-Portable-0.1.0-x64.exe**: 설치 없이 바로 실행하는 Windows 64비트 단일 실행 파일입니다. 자동 실행을 켰다면 이 파일을 같은 위치에 유지하세요.
- **JYTODO-0.1.0-Windows-x64.zip**: 폴더형 배포물입니다. 전체 압축을 푼 뒤 **JYTODO.exe**를 실행하세요. EXE만 따로 옮기면 실행되지 않습니다. 자동 실행을 켠 후 폴더를 옮겼다면 다시 설정해야 합니다.

현재는 코드 서명 전의 개발 버전입니다. 설치형 NSIS 빌드는 이 Linux 환경의 Wine 호환 오류로 완료되지 않았으며, Windows PC에서 `npm run package:installer:win`으로 별도 생성할 수 있습니다. 설치형에서 제공하는 시작 메뉴 바로가기는 Windows 시스템 알림 등록에도 도움이 됩니다. Windows 설치·OS 알림·시작 프로그램 등록의 최종 확인은 실제 Windows PC에서 필요합니다. Linux Electron 검증을 Windows 실기 검증으로 간주하지 않습니다.

## 닫기·트레이·예약 알림

- 창의 **X**는 종료하지 않고 **트레이(작업 표시줄 알림 영역)** 로 숨깁니다.
- 예약 시간에 메인 프로세스가 창을 다시 열고 할 일 팝업과 OS 알림을 표시합니다. 브라우저를 열어둘 필요가 없습니다.
- 트레이 아이콘을 누르면 창이 열립니다. 트레이 메뉴의 **완전히 종료**, 프로그램 메뉴의 **완전히 종료**, `Ctrl+Q`는 예약 처리도 종료합니다.
- **앱 연동 및 설정 → Windows 시작 시 자동 실행**은 초기에는 꺼져 있습니다. 사용자가 Windows 배포 실행 파일에서 선택할 수 있습니다.
- PC 종료·절전·프로그램 완전 종료 중에는 알림이 울리지 않습니다. 재실행/절전 복귀 후 미확인 지난 알림을 표시합니다. OS 방해 금지와 알림 차단은 시스템 알림 표시를 제한할 수 있습니다.
- 트레이를 지원하지 않는 환경에서는 닫을 때 프로그램이 종료됩니다. 설정 화면에 이를 안내하며 예약을 유지하려면 창을 최소화해야 합니다.

## PC 데이터와 외부 서비스 설정

**앱 연동 및 설정 → 데이터·연동 설정 폴더 열기**를 누릅니다. Windows 기본 위치는 `%APPDATA%/jytodo`입니다.

- `jytodo.sqlite` 및 WAL 파일: 할 일과 Google OAuth 토큰
- `integration.env`: 최초 실행 시 빈 템플릿이 생성되는 연동 설정

`integration.env`를 메모장으로 수정한 뒤 트레이에서 **완전히 종료**하고 다시 실행하세요. 비밀 값은 Git이나 채팅으로 공유하지 마세요.

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SLACK_WEBHOOK_URL=
```

Google Cloud에서 Calendar API를 활성화하고 OAuth 동의 화면/테스트 사용자를 설정합니다. 현재 개인 개발 버전은 **웹 애플리케이션 OAuth 클라이언트**를 사용하며, 승인된 리디렉션 URI에 정확히 `http://127.0.0.1:43127/api/google/callback`을 등록하세요. Client ID/Secret 설정과 재시작 후 프로그램의 **Google 계정 연결**을 누르면 기본 브라우저에서 인증합니다. 완료 안내가 보이면 프로그램으로 돌아옵니다. 선택한 할 일을 기본 캘린더에 전송하는 단방향 연동이며, Google에서 수정한 내용을 가져오지는 않습니다.

Slack은 Incoming Webhook을 생성하여 `SLACK_WEBHOOK_URL`에 등록합니다. 재시작 후 테스트 메시지를 보내고 할 일에서 Slack 알림을 선택하세요. 프로그램이 트레이에서 실행 중이면 예약 전송도 처리합니다.

프로그램은 사용자 데이터 폴더의 세 연동 항목만 읽습니다. 개발 웹 서버의 `.env` 및 `data/`와 별개이며 기존 웹 데이터를 자동 이동하거나 덮어쓰지 않습니다. 토큰/키는 로컬에 저장하며 별도 디스크 암호화는 하지 않습니다. 공개 배포 전에는 Google 동의 화면 검증, 배포용 데스크톱 OAuth 및 암호화된 토큰 보관 방식을 별도로 준비해야 합니다.

DB 백업은 프로그램을 완전히 종료한 뒤 사용자 데이터 폴더 전체를 복사하세요. 설치 제거 시 데이터는 기본 유지합니다. 로그인·여러 PC 간 자동 동기화·모바일 앱·자동 업데이트는 아직 포함하지 않습니다.

## 데스크톱 개발·패키징

Node.js 24 이상에서 저장소 폴더로 이동합니다.

```sh
npm ci
npm run setup:electron
npm run desktop
```

`desktop`은 화면을 빌드하고 프로그램을 실행합니다. Windows 단일 실행 파일과 ZIP 생성:

```sh
npm run package:win
```

Linux 테스트용 실행 폴더는 `npm run package:linux`로 만듭니다. macOS 배포는 준비하지 않았습니다. 이 클라우드에서는 쓰기 가능한 캐시를 사용합니다.

```sh
npm ci --cache /workspace/.cache/npm
XDG_CACHE_HOME=/workspace/.cache electron_config_cache=/workspace/.cache/electron npm run setup:electron
DISPLAY=:99 XDG_CACHE_HOME=/workspace/.cache ELECTRON_CACHE=/workspace/.cache/electron ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder npm run package:win
```

Electron과 패키징 도구는 공식 배포처에서 체크섬/TLS 검증을 유지하여 받습니다. Linux 격리 테스트의 `--no-sandbox`는 Windows 제품 실행에는 추가하지 않습니다.

## 데스크톱 검증

```sh
npm test
npm run build
npm run test:desktop
```

API·DB·연동·메인 프로세스 스케줄러 테스트 13개를 제공합니다. 데스크톱 통합 테스트는 별도 임시 사용자 폴더에서 전용 창, renderer의 Node 접근 차단, 로컬 API 인증, X로 트레이 숨김, 예약 시간에 창 복원, 다시 알림, 설정 화면 및 재시작 후 데이터 보존을 확인합니다. 실제 외부 채널에 메시지를 보내지 않습니다.

Linux CI에서는 X 디스플레이가 필요합니다. 이 클라우드에는 `/workspace/.tools/xvfb/usr/bin/Xvfb`를 준비했습니다. 가상 디스플레이를 시작한 뒤 `DISPLAY=:99 npm run test:desktop`을 실행하세요. 패키징된 Linux 바이너리는 `JYTODO_DESKTOP_EXECUTABLE=/절대경로/jytodo DISPLAY=:99 npm run test:desktop`으로 검증할 수 있습니다. 결과 화면은 `test-results/desktop-native.png`에 저장됩니다.

실제 Windows 설치/시작 프로그램 등록/OS 알림, Google 계정 연결, Slack 수신은 해당 PC와 계정에서 별도로 확인해야 합니다.

## 데스크톱 구조

`desktop/`는 Electron 생명주기·트레이·메인 프로세스 알림·제한된 preload, `src/`는 화면, `server/`는 저장/API/연동입니다. 화면은 Node 접근 없이 sandbox와 context isolation으로 실행합니다. 내부 API는 127.0.0.1:43127에만 바인딩하며 매 실행 시 임의 토큰을 요구합니다. 이 토큰은 renderer나 외부 HTTPS 서비스에 전달하지 않습니다. 기본 브라우저에서 사용하는 Google 인증 시작/콜백만 예외로 둡니다. Electron 네트워크 스택으로 OS 프록시·인증서 설정을 사용합니다.

포트가 점유되어 있으면 오류를 표시하고 종료합니다. 개발 테스트용 `JYTODO_DESKTOP_PORT`를 바꾸면 Google 리디렉션 주소도 일치시켜야 합니다. 기본 제품 실행은 `npm run desktop`이며, 아래 브라우저 모드는 UI 개발 참고용입니다.

---

## 브라우저 개발 모드 참고

날짜·시간별 할 일과 예약 알림을 관리하는 한국어 웹앱입니다. PC와 모바일 브라우저에서 사용하고, 지원 브라우저에서는 홈 화면에 설치할 수 있습니다.

## 실행

Node.js 24 이상을 사용합니다. 별도 DB 서비스는 필요하지 않습니다.

```sh
cd /workspace/JYTODO
npm ci --cache /workspace/.cache/npm
cp .env.example .env # 최초 설정 시에만 실행; 기존 파일은 유지
npm run dev
```

기본 포트는 3000입니다. 개발 서버는 Express + Vite로 동작합니다. 배포용 빌드는 `npm run build`, 실행은 `npm start`입니다. 서버를 종료한 뒤 실행 모드를 바꾸세요. `PORT`를 바꾸면 `APP_URL`과 Google 리디렉션 주소도 일치시켜야 합니다.

브라우저 개발 모드는 **개인용 로컬 서버**입니다. 서버는 127.0.0.1에만 바인딩합니다. 공개 인터넷으로 노출하려면 로그인·사용자별 데이터 분리·HTTPS·운영 배포 구성이 추가로 필요합니다. 여러 기기 사이 자동 동기화는 제공하지 않습니다. 데스크톱 실행은 위 Windows 프로그램 안내를 참고하세요.

## 기능

- 할 일 추가·수정·삭제·완료/완료 취소, 메모, 분류, 중요도
- 날짜와 시간순 목록, 주간 날짜 선택, 월간 캘린더, 전체/예정/완료 보기, 검색·분류·중요도 필터
- 정시 또는 5/10/30/60분 전 예약 알림, 앱 내 팝업, 10분 뒤 다시 알림
- 브라우저 알림 권한을 허용하면 시스템 알림도 제공
- 로컬 SQLite 영구 저장 (`data/jytodo.sqlite`), 재시작 시 데이터·미확인 알림 유지
- Google 기본 캘린더로 일정 전송 및 수정·완료·삭제 반영
- Slack Incoming Webhook을 통한 예약 알림 (할 일별 선택)
- 계정 없이 ICS 파일 내보내기

### 알림 동작 범위

앱 내 팝업/시스템 알림은 **서버가 실행 중이고 앱 페이지가 열려 있을 때** 약 3초 간격으로 확인합니다. 브라우저의 절전/백그라운드 제한으로 지연될 수 있습니다. 페이지를 다시 열면 아직 확인하지 않은 지난 알림도 표시합니다. 앱 종료 중의 OS 팝업이나 정확한 초 단위 전달은 보장하지 않습니다. 닫힌 앱에 알림을 보내려면 향후 Web Push 또는 네이티브 백그라운드 실행 기능이 필요합니다. 설치용 서비스 워커는 백그라운드 알람 엔진이 아닙니다.

Slack 알림은 브라우저가 닫혀 있어도 **서버가 실행 중이면** 약 5초마다 처리합니다. 서버 중단 중 지난 예약은 재시작 후 전송합니다. 실패는 해당 할 일에 표시하고 1분 간격으로 재시도합니다. 외부 전송 후 응답이 유실되거나 서버가 종료되면 중복 전송 가능성이 있습니다.

날짜는 사용한 기기의 시간대로 입력하고 UTC로 저장합니다. Slack과 Google에는 저장된 기기 시간대를 함께 사용합니다. 다른 시간대 기기에서 열면 목록은 그 기기의 현지 시간으로 표시합니다.

## Google 캘린더 연결

1. Google Cloud 프로젝트에서 **Google Calendar API**를 활성화합니다.
2. OAuth 동의 화면을 설정합니다. 테스트 모드라면 사용할 Google 계정을 테스트 사용자로 추가합니다.
3. **웹 애플리케이션** OAuth 클라이언트를 만들고 승인된 리디렉션 URI에 `http://localhost:3000/api/google/callback`을 등록합니다.
4. 서버 `.env`에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 설정합니다. `APP_URL=http://localhost:3000`을 유지합니다. 비밀 값은 커밋하거나 채팅에 공유하지 마세요.
5. 서버를 재시작하고 앱의 **앱 연동 및 설정 → Google 계정 연결**을 누릅니다.
6. 할 일에서 **Google 캘린더로 보내기**를 선택합니다.

선택한 할 일은 기본 캘린더에 30분 일정으로 전송됩니다. 수정은 전송한 이벤트에만 반영합니다. 완료/삭제/연동 체크 해제는 해당 이벤트를 삭제합니다. 완료 취소는 새로 생성합니다. Google에서 직접 한 변경은 앱으로 가져오지 않는 **단방향 연동**입니다. 전송 실패 시 할 일은 보존되고 오류와 다시 전송 버튼이 표시됩니다. 연결 해제는 로컬 토큰을 지우며 기존 원격 일정을 일괄 삭제하거나 Google의 앱 권한 자체를 철회하지 않습니다. Google 계정 설정에서 앱 권한을 철회할 수 있습니다.

OAuth는 state·PKCE를 사용합니다. 토큰은 브라우저로 보내지 않고 로컬 DB에 보관합니다. DB는 접근 권한 0600으로 생성되지만 디스크 암호화는 하지 않으므로 운영 시 비밀 저장소/암호화 및 접근 통제가 필요합니다. Google 테스트 모드의 refresh token은 만료될 수 있어 재연결이 필요할 수 있습니다.

## Slack 연결

1. Slack 앱에서 **Incoming Webhooks**를 켜고 알림을 받을 채널의 Webhook URL을 발급합니다.
2. 서버 `.env`에 `SLACK_WEBHOOK_URL`을 설정한 뒤 서버를 재시작합니다.
3. **앱 연동 및 설정 → 테스트 메시지 보내기**로 채널 도착을 확인합니다.
4. 할 일에서 알림을 켜고 **Slack으로 알림 받기**를 선택합니다.

Webhook 주소는 서버에서만 사용합니다. 임의 URL 대신 `https://hooks.slack.com/services/...`만 허용합니다. 실제 메시지 전송은 명시적인 테스트 버튼 또는 Slack 알림을 선택한 예약 작업에서만 발생합니다.

연동에 필요한 서버 네트워크 목적지: `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`, `hooks.slack.com` (HTTPS). 브라우저는 Google 로그인 페이지에 접근할 수 있어야 합니다.

## 검증

```sh
npm test
npm run build
npm run test:ui
```

API 테스트는 격리된 메모리 DB와 가짜 외부 서비스 응답을 사용합니다. UI 검증은 별도 임시 DB와 3101 포트에서 Chromium을 실행하므로 일반 데이터나 실제 연동 채널을 건드리지 않습니다. 시스템 Chromium이 없으면 `npx playwright install chromium`으로 설치하거나 `CHROMIUM_PATH`로 실행 파일 경로를 지정하세요. 실제 Google OAuth 및 Slack 수신 확인은 계정 설정 후 별도로 진행해야 합니다.

## 데이터와 개발

React/Vite 클라이언트, Express API, Node 내장 SQLite를 사용합니다. `src/`는 화면, `server/`는 저장소/API/연동 구현, `test/`는 자동 검증입니다. `.env`, `data/`, `node_modules/`, `dist/`, 테스트 결과는 Git에서 제외됩니다. DB 백업은 서버를 종료한 후 `data/` 전체를 복사하세요. 클라우드 작업 간 사용자 데이터 보존은 해당 환경의 스냅샷·영구 저장 정책에 따라 달라집니다.
