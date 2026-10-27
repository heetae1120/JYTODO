# JYTODO — Windows 계정 동기화 투두리스트

Windows PC에서 이메일·비밀번호로 로그인하고, 같은 계정의 할 일을 다른 PC에서도 불러오는 데스크톱 프로그램입니다. 모바일 앱은 추후 범위입니다. 인증과 저장은 Supabase를 사용하며, 사용자 PC에서는 브라우저나 Node 서버를 따로 실행하지 않습니다.

## 다운로드와 업데이트

[GitHub 최신 릴리스](https://github.com/heetae1120/JYTODO/releases/latest)의 Assets에서 받으세요.

- `JYTODO-Portable-0.2.1-x64.exe`: 설치 없이 실행하는 Windows 64비트 단일 파일
- `JYTODO-0.2.1-Windows-x64.zip`: 전체 압축을 푼 뒤 `JYTODO.exe` 실행. EXE만 따로 옮기면 실행되지 않습니다.
- `SHA256SUMS`: 파일 무결성 확인용

업데이트 전에는 기존 프로그램을 **트레이에서 완전히 종료**하세요. 현재 실행 파일은 코드 서명 전 개발 버전입니다. 자동 실행을 설정했다면 실행 파일을 같은 위치에 유지하세요.

## 기본 서버로 바로 사용하기

0.2.1부터 JYTODO 서버의 공개 연결 정보가 프로그램에 포함됩니다. 기존 프로그램을 트레이에서 완전히 종료한 뒤 새 실행 파일을 열고 **회원가입 → 이메일 인증 → 로그인**하세요. 다른 PC에서도 같은 실행 파일과 계정을 사용하면 됩니다. 개인 비밀번호와 관리 토큰은 배포하지 않습니다. 기본 메일 서비스의 정책상 초기 가입은 Supabase 프로젝트 관리 계정의 이메일을 사용하는 것이 좋습니다.

기본 프로젝트는 비어 있던 기존 Supabase 프로젝트를 JYTODO 전용으로 설정했으며 도쿄 리전을 유지합니다. 기존 요금제와 컴퓨팅 사양은 변경하지 않았습니다. 실제 DB에서 계정 간 접근 차단과 익명 차단을 검사했고 테스트 데이터는 롤백했습니다. 개인 계정의 가입·메일 수신은 사용자 본인이 진행합니다.

## 자체 서버를 사용하는 경우: Supabase 동기화 공간 만들기

기본 서버 대신 본인 소유의 서버를 운영할 때만 아래 절차가 필요합니다. 프로젝트 소유자가 본인 Supabase 계정에서 다음을 준비합니다. [자세한 새 프로젝트 설정 안내](supabase/SETUP.ko.md)를 참고하세요.

1. [Supabase 새 프로젝트](https://supabase.com/dashboard/new)에서 무료 프로젝트를 만듭니다. DB 비밀번호는 Supabase 화면에서 직접 설정하며 프로그램에 입력하지 않습니다.
2. **SQL Editor**에서 [supabase/schema.sql](supabase/schema.sql) 전체를 실행합니다. 계정별 접근 정책(RLS)과 충돌 방지 함수를 함께 만듭니다. RLS를 끄지 마세요.
3. **Authentication → URL Configuration**의 Site URL과 Redirect URLs에 `http://127.0.0.1:43127/auth/confirmed`를 설정합니다. 이메일 가입과 이메일 확인을 켜 둡니다.
4. 프로그램의 **동기화 공간 준비** 화면에 프로젝트 URL과 **Publishable 또는 anon 공개 키**를 입력합니다. `service_role`, `sb_secret_` 관리자 키는 사용할 수 없습니다.
5. 프로그램에서 **회원가입 → 이메일 인증 → 로그인**합니다. Supabase 관리 계정과 프로그램의 사용자 계정은 별개입니다.

다른 PC에서도 **같은 Supabase 프로젝트**를 연결하고 **같은 이메일·비밀번호**로 로그인하세요. 공개 연결 정보는 PC당 한 번만 입력합니다. 로그인 세션은 저장하지 않아 프로그램을 완전히 종료했다가 다시 실행하면 로그인 화면이 나옵니다. 창을 트레이에 숨기는 동작은 완전 종료가 아닙니다.

### 다른 PC에서는 아이디만 입력하도록 배포하기

프로젝트 소유자가 `cloud-config.json`에 아래 공개 정보를 넣고 다시 빌드하면, 모든 배포 PC에서 프로젝트 설정을 생략하고 로그인만 하면 됩니다.

```json
{
  "SUPABASE_URL": "https://프로젝트.supabase.co",
  "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_공개키",
  "CLOUD_REQUIRED": true
}
```

이 파일에는 로그인 비밀번호·관리자 키·Slack Webhook·Google Secret을 넣지 않습니다. URL과 공개 키는 공개 가능한 정보이며, 실제 데이터 보호는 SQL의 RLS와 사용자 로그인으로 처리합니다. 프로그램에서 직접 선택해 저장한 프로젝트 설정은 배포 기본값보다 우선합니다.

## 로그인·동기화 동작

- 처음 로그인할 때 인터넷에 연결되어 있어야 합니다. 인증 후 서버 내역과 해당 계정의 PC 캐시를 불러옵니다.
- 실행 중 약 10초 간격으로 동기화합니다. 화면의 **지금 동기화**로 바로 요청할 수 있습니다.
- 로그인 후 인터넷이 끊겨도 할 일 수정과 PC 알림은 동작합니다. 변경 내용은 계정별로 PC에 보관했다가 재연결/다음 로그인 때 보냅니다.
- 다른 PC가 같은 항목을 수정했다면 자동 덮어쓰기 대신 **계정 관리**에서 이 PC/서버의 내역 중 하나를 선택합니다. 수정과 삭제가 충돌한 경우도 같습니다.
- 삭제 표시를 서버에 보관하여 오랫동안 꺼져 있던 PC에서 삭제된 항목이 다시 생기는 것을 막습니다. 삭제한 항목의 보관 내용은 프로젝트 소유자의 DB 관리 정책을 따릅니다.
- 로그아웃하면 작업 화면·알림·서버 접근이 잠깁니다. 미동기화 변경은 해당 계정의 PC 캐시에 남고, 다시 그 계정으로 로그인하면 전송합니다.
- 두 계정의 할 일·대기 변경·Google 토큰은 분리합니다. Supabase 접근 토큰과 refresh token, 로그인 비밀번호는 파일이나 브라우저 저장소에 저장하지 않습니다.

### 기존 0.1 버전 데이터 가져오기

기존 로컬 SQLite 파일과 `tasks` 테이블은 그대로 둡니다. 로그인 후 **계정 관리 → 기존 할 일 가져오기 → 이 계정으로 가져오기**를 선택해야 업로드합니다. 자동으로 특정 계정에 귀속시키지 않습니다. 반복 가져오기는 이미 가져온 항목을 중복 복사하지 않습니다. Google·Slack 전송 설정은 다시 선택하며, 기존 비밀 키와 토큰은 계정으로 복사하지 않습니다.

## 할 일·예약 팝업

- 날짜·시간순 목록, 주간 날짜 선택, 월간 캘린더
- 추가·수정·삭제·완료/취소, 메모, 분류, 중요도, 검색·필터
- 정시 또는 5/10/30/60분 전 알림, 확인, 10분 뒤 다시 알림
- 창의 **X**는 트레이로 숨깁니다. 로그인 상태라면 예약 시간에 메인 프로세스가 창을 다시 열고 팝업·OS 알림을 표시합니다.
- 트레이의 **완전히 종료**, 프로그램 메뉴의 **완전히 종료**, `Ctrl+Q`는 프로그램과 알림 처리를 종료합니다.
- **Windows 시작 시 자동 실행**은 사용자가 선택하는 옵션입니다. PC 시작 후에도 먼저 로그인해야 알림이 동작합니다.
- PC 종료·절전·로그아웃·완전 종료 중에는 알림이 울리지 않습니다. 다시 로그인하거나 절전에서 복귀하면 미확인 지난 알림을 처리합니다.
- 알림은 각 실행 중인 PC에서 표시됩니다. Windows 방해 금지/알림 차단은 시스템 토스트를 제한할 수 있습니다. 트레이를 지원하지 않는 시스템에서는 창을 최소화해서 유지해야 합니다.

시간은 입력한 PC 시간대에서 UTC로 저장하고, 목록은 현재 기기의 현지 시간으로 보여 줍니다.

## Google 캘린더·Slack

**앱 연동 및 설정 → 데이터·연동 설정 폴더 열기**에서 `integration.env`를 수정하고 완전히 종료 후 재실행합니다.

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SLACK_WEBHOOK_URL=
```

- **Google**: Cloud에서 Calendar API와 웹 OAuth 클라이언트를 설정하고 리디렉션 URI `http://127.0.0.1:43127/api/google/callback`을 등록합니다. 프로그램의 Google 계정 연결로 기본 브라우저에서 인증합니다. 선택한 할 일을 기본 캘린더의 30분 일정으로 전송하는 단방향 연동입니다.
- **Slack**: Incoming Webhook을 만들고 URL을 설정합니다. 계정별로 **이 계정에서 이 PC Slack 연결 사용**을 선택해야 사용합니다. 다른 계정의 연결을 자동 재사용하지 않습니다. 연결 후 테스트 버튼이나 알림을 선택한 할 일에서만 메시지를 전송합니다.
- 외부 서비스 토큰·연결·전송 상태는 PC별·계정별 로컬 정보입니다. 할 일은 동기화하지만 다른 PC의 변경을 Google로 자동 재전송하는 기능은 아직 포함하지 않습니다. 새 PC에서는 외부 서비스도 연결해야 합니다.
- Slack 알림용 PC를 한 대만 연결하면 중복 전송을 피할 수 있습니다. 여러 PC에서 같은 채널로 예약 전송하면 중복 알림이 생길 수 있습니다. 실패는 항목에 표시하고 1분 간격으로 재시도합니다.
- ICS 내보내기로 계정 연결 없이 캘린더 파일을 받을 수도 있습니다.

## 데이터 보관과 범위

Windows 기본 사용자 데이터 위치는 `%APPDATA%/jytodo`입니다. 프로그램에서 폴더를 열 수 있습니다. `jytodo.sqlite`와 WAL 파일은 기존 로컬 데이터, 계정별 캐시·대기 변경, PC별 Google 토큰을 저장합니다. `integration.env`는 외부 서비스 설정입니다.

로컬 캐시와 설정 파일은 별도 디스크 암호화를 하지 않습니다. 프로그램 로그인과 서버 RLS는 앱/서버 접근을 제어하며, 같은 OS 사용자 권한으로 DB 파일 자체를 읽는 것을 암호화로 막지는 않습니다. 백업은 프로그램을 완전히 종료한 뒤 사용자 데이터 폴더 전체를 복사하세요. 프로젝트 URL·공개 키 외의 비밀 값과 DB 파일을 GitHub에 올리지 마세요.

현재는 Windows 우선 개발 버전입니다. 모바일 앱, 자동 업데이트, 앱 내 비밀번호 복구, 서버에서 독립 실행하는 예약 알림 서비스는 포함하지 않습니다. 계정 메일 발송에는 Supabase의 발송 정책/한도가 적용되며, 외부 사용자에게 배포할 때는 SMTP 설정이 필요할 수 있습니다.

## 개발·배포

Node.js 24 이상을 사용합니다.

```sh
npm ci
npm run setup:electron
npm run desktop
```

Windows 실행 파일과 ZIP은 `npm run package:win`으로 생성합니다. 실제 Windows 머신에서 `npm run package:installer:win`을 사용하면 설치형을 만들 수 있습니다. 현재 Linux 환경의 Wine 호환 오류로 설치형 생성은 검증하지 않았습니다. Linux 테스트용 폴더는 `npm run package:linux`입니다.

클라우드 개발 환경에서는 쓰기 가능한 캐시를 사용합니다.

```sh
npm ci --cache /workspace/.cache/npm
XDG_CACHE_HOME=/workspace/.cache electron_config_cache=/workspace/.cache/electron npm run setup:electron
XDG_CACHE_HOME=/workspace/.cache ELECTRON_CACHE=/workspace/.cache/electron ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder npm run package:win
```

이 격리된 Linux 환경에서 GUI가 없으면 준비된 `/workspace/.tools/xvfb/usr/bin/Xvfb`로 가상 디스플레이를 시작합니다. Linux 테스트의 `--no-sandbox`를 Windows 제품 실행에 추가하지 않습니다. `npm run dev`는 UI 개발용 브라우저 모드이며 기본 포트는 3000입니다. `CLOUD_REQUIRED=0`은 프로젝트 미설정 상태에서 기존 로컬 기능을 검증하는 개발 테스트용 옵션입니다.

## 검증

```sh
npm test
npm run test:rls
npm run test:cloud
npm run build
npm run test:accounts:ui
npm run test:desktop
npm run test:ui
```

- 단위/API 테스트: 인증·계정 분리·두 PC 변경/삭제·오프라인 보관·충돌·동시 수정·기존 데이터·기존 알림/연동
- `test:rls`: Docker의 실제 PostgreSQL에서 익명 차단, 사용자 간 읽기/쓰기 차단, RPC 권한·버전 충돌·삭제 표시·반복 SQL 실행 검증. 네트워크/호스트 포트를 열지 않는 임시 컨테이너를 정리합니다.
- `test:accounts:ui`: 격리된 두 PC 서버와 가짜 Supabase로 로그인·계정 전환·동기화·충돌 해결 화면 검증
- `test:desktop`: 임시 데이터 폴더에서 Electron 실행, Node 접근 차단, 트레이·예약 팝업·다시 알림·재시작 보존·프로젝트 설정·로그인 잠금 검증

브라우저 검증은 `CHROMIUM_PATH` 또는 시스템 Chromium을 사용하고, 없으면 `npx playwright install chromium`으로 설치한 브라우저를 사용합니다. Linux 네이티브 검증은 `DISPLAY=:99 npm run test:desktop`으로 실행합니다. 결과 화면은 `test-results/`에 저장합니다. 기본 Supabase 프로젝트의 스키마·Auth 리디렉션은 적용되어 있으며 호스팅 DB의 RLS도 검증했습니다. `test:cloud`는 실제 Auth 응답과 익명 REST 접근 차단을 읽기 요청으로 확인합니다. 사용자 본인의 가입·메일 수신과 실제 두 PC의 개인 내역 확인은 첫 사용 때 진행합니다.

`v*` 태그를 올리면 GitHub Actions가 실제 DB 정책과 계정 화면, Windows 네이티브 앱을 검사한 뒤 릴리스에 파일을 게시합니다. 별도 개인 GitHub 토큰 없이 작업의 기본 토큰을 사용합니다.

## 구조

`desktop/`: 전용 창·트레이·메인 프로세스 알림·제한된 preload. `src/`: 화면과 로그인. `server/`: 로컬 API·SQLite·인증·동기화·외부 연동. `supabase/schema.sql`: 계정별 RLS와 낙관적 동시성 RPC.

화면은 Node 접근 없이 sandbox/context isolation으로 실행합니다. 내부 API는 `127.0.0.1:43127`에만 바인딩하고 실행별 임의 토큰을 요구하며, 로그인 전에는 데이터 API도 차단합니다. 사용자 인증 토큰은 renderer로 보내지 않습니다. Google 인증 시작/콜백과 이메일 확인 안내 페이지는 기본 브라우저를 위한 경로입니다. 포트 점유 시 오류로 종료합니다.
