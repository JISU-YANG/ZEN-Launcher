# NP-Launcher 프로젝트 v1.1 점검 보고서

작성일: 2026-03-19

## 개요

이 문서는 현재 `NP-Launcher` 프로젝트를 점검하면서 확인한 주요 이슈를 정리한 보고서다.
특히 실제 동작 오류로 이어질 가능성이 높거나, Electron 앱 특성상 보안 사고로 확대될 수 있는 항목을 우선적으로 다뤘다.

점검 범위는 다음 파일을 중심으로 진행했다.

- `main.js`
- `preload.js`
- `renderer.js`
- `preference.js`
- `index.html`
- `README.md`

## 주요 이슈 요약

| 우선순위 | 항목 | 영향도 |
| --- | --- | --- |
| 높음 | Electron 보안 설정 비활성화 + `innerHTML` 기반 렌더링 | 원격 코드 실행, 악성 스크립트 실행 가능성 |
| 높음 | `run` IPC 처리 로직의 입력 검증 부족 및 예외 처리 미흡 | 앱 강제 종료, 실행 실패 시 메인 프로세스 크래시 가능성 |
| 높음 | `index.html` 내 깨진 태그 및 마크업 손상 | 버튼/링크 오동작, UI 깨짐, DOM 해석 불일치 |
| 중간 | 한글 문자열 인코딩 손상 | 사용자 메시지 가독성 저하, 유지보수성 저하, 일부 마크업 오류 유발 |

---

## 1. Electron 보안 설정 비활성화와 `innerHTML` 사용

### 원인

`main.js`에서 생성한 `BrowserWindow`의 `webPreferences` 설정이 다음과 같이 매우 완화되어 있다.

- `nodeIntegration: true`
- `contextIsolation: false`
- `enableRemoteModule: true`

이 상태에서는 렌더러 프로세스에서 Node.js 기능과 Electron API에 거의 직접 접근할 수 있다.
문제는 `preference.js`가 사용자 저장 데이터(`electron-store`)를 그대로 문자열 템플릿으로 조합한 뒤 `innerHTML`로 DOM에 삽입하고 있다는 점이다.

관련 위치:

- [main.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/main.js#L24)
- [preference.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/preference.js#L182)
- [preference.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/preference.js#L218)

현재 구조에서는 사용자가 입력한 다음 값들이 그대로 HTML에 반영된다.

- 항목 이름 `name`
- 실행 경로 또는 URL `link`
- 이미지 URL `img`

즉, 데이터 저장소에 악성 문자열이 들어가면 단순 UI 표시 문제가 아니라 스크립트 실행으로 이어질 수 있다.

### 예상 증상

- 저장된 항목 이름이나 링크에 악성 HTML/스크립트가 섞여 있을 경우 앱 실행 시 예상하지 못한 스크립트가 동작할 수 있다.
- 링크 클릭 없이도 렌더링 과정에서 DOM이 오염될 수 있다.
- XSS가 발생하면 현재 설정상 렌더러가 Node 권한을 가지고 있어 파일 접근, 프로세스 실행, IPC 호출 등 더 큰 보안 문제로 확장될 수 있다.
- 외부 이미지 URL이나 링크 데이터가 비정상일 경우 화면이 깨지거나 항목이 비정상적으로 보일 수 있다.

### 왜 위험한가

웹 페이지에서의 XSS는 보통 페이지 범위 문제로 끝나는 경우가 많지만, Electron에서 `nodeIntegration`이 켜져 있고 `contextIsolation`이 꺼져 있으면 XSS가 곧 로컬 코드 실행 취약점이 된다.
즉, 단순 표시용 입력값 하나가 앱 전체 권한을 흔들 수 있다.

### 대처 방법

1. `BrowserWindow` 보안 설정을 기본 안전값에 가깝게 변경한다.

- `nodeIntegration: false`
- `contextIsolation: true`
- `enableRemoteModule` 제거

2. `preload.js`에서 필요한 최소 기능만 `contextBridge`로 노출한다.

- 예: `run`, `openFileDialog`, `openFolderDialog`, `saveReset`, `saveComplete` 등만 제한적으로 공개

3. `innerHTML` 기반 렌더링을 줄이고 DOM API로 요소를 생성한다.

- `document.createElement`
- `textContent`
- `setAttribute`

4. 사용자 입력값 검증을 추가한다.

- `name`: 텍스트 길이 제한
- `link`: 로컬 경로인지 URL인지 구분
- `img`: 허용 스킴 제한 (`http`, `https`, 로컬 파일 여부 등)

5. 외부 링크 처리는 명시적으로 허용된 경우에만 열도록 한다.

- `http://`, `https://`, `ms-settings:` 등 허용 목록 기반 처리 권장

### 권장 우선순위

가장 먼저 수정해야 하는 항목이다.
다른 이슈보다 먼저 구조를 안전하게 바꾸는 것이 좋다.

---

## 2. `run` IPC 처리 로직의 입력 검증 부족 및 예외 처리 미흡

### 원인

`main.js`의 `ipcMain.on('run', ...)` 핸들러는 렌더러에서 전달된 `argument`를 거의 검증하지 않고 사용한다.

관련 위치:

- [main.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/main.js#L82)

현재 로직의 문제점은 다음과 같다.

- `argument`가 문자열이라는 보장이 없는데 `substr`를 바로 호출한다.
- `.exe` 판단이 단순 문자열 끝 3글자 비교에 의존한다.
- `execFile` 콜백 안에서 에러 발생 시 `throw error`를 사용한다.
- `shell.openPath(argument)`의 반환값을 확인하지 않는다.
- 허용 가능한 명령 범위를 제한하지 않는다.

### 예상 증상

- 저장 데이터가 비정상인 경우 `substr` 호출 단계에서 예외가 발생할 수 있다.
- `.exe` 실행 실패 시 메인 프로세스가 예외로 종료될 수 있다.
- 경로가 존재하지 않거나 권한이 없을 때도 사용자는 이유를 알기 어렵다.
- 잘못된 링크 데이터가 들어가면 클릭 시 아무 반응이 없거나, 앱이 종료되거나, 예상과 다른 파일이 열릴 수 있다.

### 왜 위험한가

이 앱은 런처 역할상 "외부 프로그램 실행" 자체가 핵심 기능이다.
따라서 입력 검증이 느슨하면 단순 버그 하나가 전체 앱 안정성을 무너뜨릴 수 있다.
보안 이슈와 결합될 경우 악성 입력이 메인 프로세스에서 직접 실행될 수도 있다.

### 대처 방법

1. 입력 타입 검증을 추가한다.

- `typeof argument === 'string'`
- 빈 문자열 여부 확인

2. 경로/명령 종류를 명확히 분기한다.

- 시스템 명령: `shutdown`, `reboot`
- 외부 URL
- 로컬 폴더 경로
- 실행 파일 경로

3. 확장자 검사 로직을 안전하게 바꾼다.

- `path.extname(argument).toLowerCase() === '.exe'`

4. 예외를 `throw`하지 말고 사용자에게 에러 메시지를 전달한다.

- `dialog.showMessageBox`
- 또는 렌더러로 실패 상태를 전달

5. `shell.openPath()` 반환값을 검사한다.

- Electron의 `shell.openPath()`는 실패 시 빈 문자열이 아닌 에러 문자열을 반환할 수 있으므로 결과를 확인해야 한다.

6. 가능한 경우 `ipcMain.handle` + `invoke` 패턴으로 바꿔 응답형 처리 구조로 정리한다.

### 권장 우선순위

보안 설정 개선 다음으로 바로 처리하는 것이 좋다.
사용자 체감 안정성과 직결되는 부분이다.

---

## 3. `index.html`의 깨진 마크업과 DOM 구조 손상

### 원인

`index.html`에 일부 태그가 정상적으로 닫히지 않거나, 문자열이 깨지면서 HTML 문법까지 손상된 부분이 있다.

관련 위치 예시:

- [index.html](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/index.html#L543)
- [index.html](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/index.html#L564)
- [index.html](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/index.html#L573)
- [index.html](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/index.html#L589)
- [index.html](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/index.html#L602)

확인된 유형은 다음과 같다.

- `alt` 속성 문자열이 중간에서 깨져 태그가 비정상 종료됨
- `</a>` 닫는 태그가 깨져 문자열로 남아 있음
- 버튼/카테고리 텍스트 영역에 닫는 태그가 섞여 있음
- 일부 한글 손상이 태그 경계까지 침범함

### 예상 증상

- 특정 링크나 버튼이 클릭되지 않거나 예상보다 넓은 영역이 클릭될 수 있다.
- DOM 트리 해석이 브라우저 복구 로직에 의존하게 되어 환경에 따라 다르게 보일 수 있다.
- CSS 선택자 적용 범위가 꼬일 수 있다.
- 스크립트가 찾는 요소 구조가 달라져 이벤트가 누락될 수 있다.
- 접근성 속성(`alt`)이 정상 동작하지 않는다.

### 왜 위험한가

HTML 파싱 오류는 겉보기엔 단순 오타처럼 보여도, 실제로는 이벤트 바인딩 실패와 UI 오동작으로 이어진다.
특히 현재 앱은 정적 HTML에 의존하고 있어, 한 곳이 깨지면 UI 전체 일관성이 크게 흔들릴 수 있다.

### 대처 방법

1. 깨진 태그를 모두 정상 HTML로 복구한다.

- 모든 `<a>`, `<div>`, `<img>` 태그의 시작/종료 구조 점검
- 속성 문자열 내 따옴표 확인

2. `meta charset="UTF-8"`를 명시한다.

- 문서 최상단 `head` 내부에 추가

3. HTML 검증 도구 또는 에디터 진단 기능을 사용해 문법 오류를 정리한다.

4. 텍스트와 마크업을 분리해 관리한다.

- 긴 문자열은 JS 템플릿에 섞지 않기
- UI 텍스트를 별도 상수 또는 리소스처럼 관리 검토

5. 수정 후 실제 화면에서 클릭 영역과 렌더링을 확인한다.

- footer 버튼
- 설정 패널 카테고리 버튼
- 중앙 링크 영역

### 권장 우선순위

높음이다.
보안 문제만큼 파급력이 크진 않지만, 지금 상태는 실제 UI 동작에 영향을 줄 수 있다.

---

## 4. 한글 문자열 인코딩 손상

### 원인

프로젝트 여러 파일에서 한글이 깨져 보인다.
이는 보통 다음과 같은 상황에서 발생한다.

- 파일이 UTF-8이 아닌 다른 인코딩으로 저장됨
- 편집기에서 잘못된 인코딩으로 열고 다시 저장함
- 복사/붙여넣기 과정에서 문자셋이 손상됨

관련 위치:

- [README.md](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/README.md)
- [main.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/main.js#L121)
- [preference.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/preference.js#L101)
- [index.html](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/index.html#L535)

### 예상 증상

- 사용자에게 보이는 버튼명, 안내문, 경고문이 깨져 신뢰도가 크게 떨어진다.
- README 가독성이 낮아져 배포 문서 품질이 떨어진다.
- 일부 문자열 깨짐이 HTML 태그와 섞이면 실제 마크업 오류를 일으킬 수 있다.
- 차후 유지보수 시 원래 문구를 추적하기 어려워진다.

### 왜 위험한가

인코딩 문제는 단순 표시 오류로 끝날 수도 있지만, 현재 프로젝트에서는 HTML 구조 손상과 함께 나타나고 있다.
즉, 표현 문제를 넘어 기능 오류의 원인이 될 수 있다.

### 대처 방법

1. 모든 소스 파일 인코딩을 UTF-8로 통일한다.

- `index.html`
- `main.js`
- `preference.js`
- `README.md`

2. 에디터 기본 인코딩을 UTF-8로 고정한다.

3. 한글 문구를 원문 기준으로 복구한다.

- 버튼명
- placeholder
- 다이얼로그 메시지
- README 문서

4. HTML 문서에는 `meta charset="UTF-8"`를 추가한다.

5. 복구 후 실제 앱 화면과 README 렌더링을 함께 확인한다.

### 권장 우선순위

중간이다.
다만 HTML 손상과 연결된 부분은 우선순위를 높여 함께 수정하는 것이 좋다.

---

## 추가 관찰 사항

### 1. 테스트/검증 체계 부재

현재 `package.json`에는 테스트 스크립트가 없다.
또한 `node_modules`가 없는 상태라 바로 실행 검증도 불가능했다.

관련 위치:

- [package.json](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/package.json)

예상 영향:

- 수정 후 회귀 여부를 자동으로 확인하기 어렵다.
- UI/IPC 로직이 깨져도 수동 확인 전까지 놓치기 쉽다.

권장 대응:

- 최소한의 실행 체크 절차 문서화
- 향후 린트 또는 간단한 검증 스크립트 추가 검토

### 2. 불필요하거나 오래된 설정 흔적

`main.js`에서 `contextIsolated`를 `process`에서 가져오지만 사용하지 않는다.
또한 `enableRemoteModule`은 최신 Electron 흐름에서는 지양되는 설정이다.

관련 위치:

- [main.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/main.js#L4)
- [main.js](c:/Users/jisuy/OneDrive/문서/dev/NP-Launcher/NP-Launcher/main.js#L28)

예상 영향:

- 코드 독해가 어려워진다.
- 최신 Electron 보안 모델과 멀어진다.

권장 대응:

- 미사용 코드 제거
- 현재 Electron 버전에 맞는 설정 정리

---

## 우선 조치 권장 순서

1. Electron 보안 설정 정리와 `preload.js` 기반 API 노출 구조로 전환
2. `innerHTML` 제거 또는 최소한 안전한 DOM 생성 방식으로 교체
3. `run` IPC 입력 검증 및 예외 처리 보강
4. `index.html` 마크업 복구 및 `meta charset="UTF-8"` 추가
5. 한글 인코딩 전체 복구
6. 기본 검증 절차 또는 테스트 보강

## 결론

현재 프로젝트는 규모가 크지 않아 구조를 정리하기 좋은 상태지만, Electron 특성상 보안 설정과 렌더링 방식 문제는 작게 볼 수 없다.
특히 "사용자 입력 저장"과 "외부 프로그램 실행"이 결합된 앱이기 때문에, 입력값을 안전하게 다루고 메인 프로세스 권한 경계를 분리하는 것이 가장 중요하다.

이번 점검에서는 즉시 수정이 필요한 항목들이 분명하게 확인되었다.
다음 단계에서는 보안 구조 정리와 HTML/인코딩 복구를 함께 진행하는 것이 가장 효과적이다.
