# NP-Launcher: 빠른 실행을 위한 개인용 런처

NP-Launcher는 자주 사용하는 프로그램, 웹사이트, 폴더, 시스템 기능을 한 화면에서 빠르게 실행할 수 있도록 만든 Electron 기반 런처입니다.

![NP-Launcher Thumbnail](./doc/thumbnail-01.png)

[프로젝트 회고 보기](https://jisulog.com/docs/essay/project-review/2023-np-launcher)

## 시작하기

### 설치

배포된 실행 파일을 내려받아 원하는 위치에 두고 실행하면 됩니다.

### 개발 실행

```bash
npm install
npm start
```

## 주요 기능

- 로컬 프로그램 실행
- 웹사이트 바로가기 실행
- 폴더 바로 열기
- Google 검색 바로가기
- Windows 설정 및 시스템 기능 바로가기

## 사용 기술

- JavaScript
- HTML/CSS
- Electron
- electron-store
- electron-shutdown-command

## 릴리스 노트

### v1.2 (2026-03-19)

- `preload` 기반 IPC 구조로 변경해 Electron 보안 경계를 분리했습니다.
- `nodeIntegration`을 비활성화하고 `contextIsolation`을 활성화해 보안 설정을 강화했습니다.
- 사용자 저장 데이터를 `innerHTML` 대신 DOM API로 렌더링하도록 변경했습니다.
- 실행 경로와 외부 링크 처리에 대한 입력 검증 및 오류 처리를 추가했습니다.
- 깨진 HTML 마크업과 문자열 인코딩 문제를 정리했습니다.

### v1.1 (2024-03-17)

- 탐색기를 통해 파일 경로를 더 쉽게 입력할 수 있도록 개선했습니다.
- UI/UX를 정리해 설정 흐름을 더 직관적으로 다듬었습니다.
- Map 기반 데이터 관리 구조를 적용했습니다.
- JavaScript 구조를 정리해 유지보수성을 높였습니다.

### v1.0 (2023-03-15)

- NP-Launcher 최초 공개 버전입니다.

## 라이선스

Copyright 2023. [JISU YANG](https://jisulog.com/). All rights reserved.
