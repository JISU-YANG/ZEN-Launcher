# ZEN Launcher: 빠른 실행을 위한 개인 런처

ZEN Launcher는 자주 사용하는 프로그램, 웹사이트, 폴더, 검색, 위젯 기능을 하나의 화면에서 빠르게 실행할 수 있도록 만든 Electron 기반 런처입니다.

![ZEN Launcher Thumbnail](./doc/thumbnail-01.png)

[프로젝트 회고 보기](https://jisulog.com/docs/essay/project-review/2023-np-launcher)

## 시작하기

### 설치

배포된 실행 파일을 내려받아 원하는 위치에 두고 바로 실행하면 됩니다.

### 개발 실행

```bash
npm install
npm start
```

## 주요 기능

- 로컬 프로그램 실행
- 웹사이트 바로가기 실행
- 폴더 바로 열기
- 검색 엔진 프리픽스 검색
- 날씨 위젯
- Quick Tools 위젯
- 예약 종료 위젯
- Windows 설정 및 기본 도구 바로가기

## 사용 기술

- JavaScript
- HTML/CSS
- Electron
- electron-store
- electron-shutdown-command

## 릴리스 노트

### v2.0 (2026-03-20)

- 런처 상단에 위젯 시스템을 추가하고 날씨, Quick Tools, 예약 종료 위젯을 지원합니다.
- `Ctrl+Space`로 검색창에 바로 포커스할 수 있도록 개선했습니다.
- 검색 프리픽스 `g`, `n`, `y`, `c`를 추가해 Google, Naver, YouTube, Coupang 검색을 빠르게 전환할 수 있습니다.
- 현재 위치 기반 날씨 조회, 위치 fallback, 상태 표시를 포함한 날씨 위젯을 추가했습니다.
- 계산기, 시계, 메모장, 캡처도구, 그림판을 실행할 수 있는 Quick Tools 위젯을 추가했습니다.
- 분 단위 예약 종료와 예약 취소를 설정할 수 있는 예약 종료 위젯을 추가했습니다.
- 내부 식별자를 `zen-launcher` 기준으로 정리하고 레거시 `np-launcher` 경로를 대부분 정리했습니다.
- 환경설정 UI를 개편하고 항목 추가/편집/삭제 흐름을 개선했습니다.
- 렌더러 이벤트 구조와 환경설정 dirty 체크를 정리해 메모리 사용과 반복 렌더링 비용을 줄였습니다.
- 한글 문구 및 인코딩 깨짐 문제를 정리했습니다.

### v1.2 (2026-03-19)

- `preload` 기반 IPC 구조로 변경해 Electron 보안 경계를 분리했습니다.
- `nodeIntegration`을 비활성화하고 `contextIsolation`을 활성화해 보안 설정을 강화했습니다.
- 사용자 데이터 렌더링을 `innerHTML` 대신 DOM API 기반으로 정리했습니다.
- 실행 경로, 외부 링크 처리, 입력 검증과 오류 처리를 보강했습니다.
- HTML 마크업과 문자열 인코딩 문제를 일부 정리했습니다.

### v1.1 (2024-03-17)

- 파일 탐색기를 통해 경로를 쉽게 입력할 수 있도록 개선했습니다.
- UI/UX를 정리하고 설정 이름을 더 직관적으로 다듬었습니다.
- Map 기반 데이터 관리 구조를 적용했습니다.
- JavaScript 구조를 정리해 유지보수성을 높였습니다.

### v1.0 (2023-03-15)

- ZEN Launcher 최초 공개 버전입니다.

## 라이선스

Copyright 2023. [JISU YANG](https://jisulog.com/). All rights reserved.
