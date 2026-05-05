#!/usr/bin/env bash
# marketing_agent 초기 설치 스크립트 — 비개발자도 실행 가능
# 사용법: bash setup.sh
# 재실행 안전: 이미 설정된 항목은 건너뜀

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 색상 ────────────────────────────────────────────────────────────────────
GR='\033[0;32m'; YL='\033[1;33m'; RD='\033[0;31m'; CY='\033[0;36m'
DM='\033[2m'; BD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GR}✅${NC}  $*"; }
warn() { echo -e "${YL}⚠️ ${NC}  $*"; }
err()  { echo -e "${RD}❌${NC}  $*"; }
info() { echo -e "${CY}ℹ️ ${NC}  $*"; }
dim()  { echo -e "${DM}    $*${NC}"; }
hr()   { echo -e "${DM}────────────────────────────────────────────────${NC}"; }

# ── 헤더 ────────────────────────────────────────────────────────────────────
echo
echo -e "${BD}${CY}🚀  marketing_agent 설치 마법사${NC}"
echo -e "${DM}    처음 실행하거나 환경을 초기화할 때 사용하세요.${NC}"
hr
echo

# ── STEP 1: Node 버전 ────────────────────────────────────────────────────────
echo -e "${BD}[1/7] Node.js 버전 확인${NC}"
if ! command -v node &>/dev/null; then
  err "Node.js가 설치되어 있지 않습니다."
  echo "    👉 https://nodejs.org  에서 v20 이상을 설치하세요."
  exit 1
fi

NODE_VER=$(node --version)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  err "Node $NODE_VER 감지. v20 이상 필요."
  echo "    👉 https://nodejs.org  또는  nvm install 20"
  exit 1
fi
ok "Node $NODE_VER"
echo

# ── STEP 2: 의존성 설치 ──────────────────────────────────────────────────────
echo -e "${BD}[2/7] 의존성 설치 (npm install)${NC}"
if [ -d "node_modules" ]; then
  dim "node_modules 이미 존재 — 건너뜀"
else
  info "설치 중... (1~2분 소요)"
  npm install --silent
  ok "의존성 설치 완료"
fi
echo

# ── STEP 3: .env.local 설정 ──────────────────────────────────────────────────
echo -e "${BD}[3/7] 환경 설정 (.env.local)${NC}"

if [ -f ".env.local" ]; then
  warn ".env.local 이 이미 존재합니다."
  printf "    덮어쓸까요? [y/N] "
  read -r OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    dim ".env.local 유지 — 건너뜀"
    SKIP_ENV=1
  else
    SKIP_ENV=0
  fi
else
  SKIP_ENV=0
fi

if [ "${SKIP_ENV:-0}" = "0" ]; then
  echo
  echo -e "  카드 이미지를 어떻게 생성할까요?"
  echo
  echo -e "  ${BD}1) inhouse-slides${NC} ${GR}(권장)${NC}"
  dim "     Claude가 HTML 카드뉴스 생성 → Playwright 자동 캡처"
  dim "     추가 API 키 불필요 — Claude Code만 있으면 됩니다"
  echo
  echo -e "  ${BD}2) fal${NC}"
  dim "     fal.ai AI 이미지 생성 (FAL_KEY 필요)"
  echo
  echo -e "  ${BD}3) openai${NC}"
  dim "     OpenAI DALL·E 이미지 생성 (OPENAI_API_KEY 필요)"
  echo
  printf "  선택 [1/2/3, 기본값 1]: "
  read -r PROVIDER_CHOICE

  case "${PROVIDER_CHOICE:-1}" in
    2) PROVIDER="fal" ;;
    3) PROVIDER="openai" ;;
    *) PROVIDER="inhouse-slides" ;;
  esac

  # .env.local 작성
  {
    echo "# marketing_agent 환경 설정 — $(date '+%Y-%m-%d')"
    echo "CONTENT_ENGINE_PROVIDER=$PROVIDER"
  } > .env.local

  ok "CONTENT_ENGINE_PROVIDER=$PROVIDER"

  # provider별 API 키 수집
  if [ "$PROVIDER" = "fal" ]; then
    echo
    echo -e "  ${BD}fal.ai API 키${NC}  (https://fal.ai/dashboard/keys)"
    printf "  FAL_KEY: "
    read -r FAL_KEY_VAL
    if [ -n "$FAL_KEY_VAL" ]; then
      echo "FAL_KEY=$FAL_KEY_VAL" >> .env.local
      ok "FAL_KEY 저장"
    else
      warn "FAL_KEY 미입력 — 나중에 .env.local 에 직접 추가하세요"
    fi
  fi

  if [ "$PROVIDER" = "openai" ]; then
    echo
    echo -e "  ${BD}OpenAI API 키${NC}  (https://platform.openai.com/api-keys)"
    printf "  OPENAI_API_KEY: "
    read -r OPENAI_KEY_VAL
    if [ -n "$OPENAI_KEY_VAL" ]; then
      echo "OPENAI_API_KEY=$OPENAI_KEY_VAL" >> .env.local
      ok "OPENAI_API_KEY 저장"
    else
      warn "OPENAI_API_KEY 미입력 — 나중에 .env.local 에 직접 추가하세요"
    fi
  fi

  # 선택적 Anthropic 키 (카피 생성 품질 향상)
  if [ "$PROVIDER" != "inhouse-slides" ]; then
    echo
    echo -e "  ${BD}Anthropic API 키${NC}  (카피 생성 품질 향상, 선택)"
    dim "  Claude Code 로그인한 계정과 같은 키: https://console.anthropic.com/settings/keys"
    printf "  ANTHROPIC_API_KEY (Enter 건너뜀): "
    read -r ANTHROPIC_KEY_VAL
    if [ -n "$ANTHROPIC_KEY_VAL" ]; then
      echo "ANTHROPIC_API_KEY=$ANTHROPIC_KEY_VAL" >> .env.local
      ok "ANTHROPIC_API_KEY 저장"
    fi
  fi
fi
echo

# ── STEP 4: Playwright Chromium ──────────────────────────────────────────────
echo -e "${BD}[4/7] Playwright Chromium 브라우저${NC}"

# .env.local 에서 provider 재확인
ENV_PROVIDER=$(grep '^CONTENT_ENGINE_PROVIDER=' .env.local 2>/dev/null | cut -d= -f2 || echo "inhouse-slides")

if [ "$ENV_PROVIDER" = "inhouse-slides" ]; then
  info "Playwright Chromium 확인 중..."
  npx playwright install chromium 2>&1 | tail -2
  ok "Chromium 준비 완료"
else
  dim "provider=$ENV_PROVIDER — Playwright 불필요, 건너뜀"
fi
echo

# ── STEP 5: 런타임 디렉토리 ──────────────────────────────────────────────────
echo -e "${BD}[5/7] 런타임 디렉토리 생성${NC}"
mkdir -p auth out posts/campaigns posts/by-channel
ok "auth/  out/  posts/campaigns/  posts/by-channel/"
echo

# ── STEP 6: 실행 권한 ────────────────────────────────────────────────────────
echo -e "${BD}[6/7] 실행 권한 설정${NC}"
chmod +x harness/bin/*.mjs 2>/dev/null || true
[ -f harness/statusline/statusline.sh ] && chmod +x harness/statusline/statusline.sh 2>/dev/null || true
ok "harness/bin/*.mjs 실행 권한 부여"
echo

# ── STEP 7: 환경 진단 ────────────────────────────────────────────────────────
echo -e "${BD}[7/7] 환경 진단 (doctor)${NC}"
echo
node harness/bin/doctor.mjs --quick || true
echo

# ── 완료 ────────────────────────────────────────────────────────────────────
hr
echo -e "${BD}${GR}🎉 설치 완료!${NC}"
echo
echo -e "${BD}다음 단계:${NC}"
echo
echo -e "  ${BD}1.${NC} Claude Code 를 열고 이 폴더를 플러그인으로 등록하세요"
dim "     Claude Code > Settings > Extensions > Add Plugin > 이 폴더 선택"
echo
echo -e "  ${BD}2.${NC} Claude Code 대화창에서 실행:"
echo -e "       ${CY}/sns-start${NC}"
dim "     회사 소개 인터뷰 → 캠페인 주제 입력 → 카드 자동 생성 → 발행"
echo
echo -e "  ${BD}3.${NC} 채널 계정 연결이 필요하면:"
echo -e "       ${CY}/sns-doctor${NC}  →  auth 항목 확인"
echo
dim "  문제가 있으면 'node harness/bin/doctor.mjs' 실행 후 결과를 공유하세요."
hr
echo
