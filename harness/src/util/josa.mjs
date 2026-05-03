// 한국어 조사 자동 선택 — 받침 유무에 따라 올바른 조사 형태를 반환.
//
// 사용:
//   `${brand}${josa(brand, '이/가')} 답입니다`  → 업플로우가 / 포트원이
//   `${noun}${josa(noun, '을/를')}`            → 책을 / 사과를
//   `${noun}${josa(noun, '으로/로')}`          → 칼로 / 책으로 (ㄹ 받침은 -로 우선)
//
// 한계:
// - 한글 종성 코드포인트 검사 + 영문/숫자/외래어 휴리스틱.
// - "iOS", "K8s" 처럼 발음 모호한 약어는 휴리스틱에 의존 — 100% 정확 X.
// - 종성 ㄹ 만 다른 받침과 다르게 다루는 조사 (-(으)로) 만 특수 처리. 다른 ㄹ-특수
//   조사 (예: -이라/라) 는 일반 받침 규칙 따름 (이라/라).

const HANGUL_BASE = 0xAC00;
const HANGUL_END = 0xD7A3;

// 받침 있음 → 첫 번째, 받침 없음 → 두 번째.
const PAIRS = {
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '과/와': ['과', '와'],
  '아/야': ['아', '야'],
  '이여/여': ['이여', '여'],
  '이라/라': ['이라', '라'],
};

/**
 * 단어의 마지막 글자가 받침을 가지는지 판정.
 * @param {string} word
 * @returns {boolean}
 */
export function hasFinalConsonant(word) {
  if (!word || typeof word !== 'string') return false;
  // 끝 구두점/괄호/공백/dash 류는 발음에 영향 없으므로 무시 후 마지막 의미 음절 검사.
  // 예: "5억)" → "5억", "Stripe." → "Stripe"
  const trimmed = String(word).trim().replace(/[\s)\]}'"”’.,!?…—–\-]+$/u, '');
  const lastChar = trimmed.slice(-1);
  if (!lastChar) return false;
  const cp = lastChar.codePointAt(0);

  // 한글 음절 범위 — 종성 인덱스 = (cp - 0xAC00) % 28
  if (cp >= HANGUL_BASE && cp <= HANGUL_END) {
    return ((cp - HANGUL_BASE) % 28) !== 0;
  }

  // 숫자: 한국어 발음 기준 — 1,3,6,7,8,0(영) → 받침 / 2,4,5,9 → 없음
  if (/[0-9]/.test(lastChar)) {
    return ['1', '3', '6', '7', '8', '0'].includes(lastChar);
  }

  // 영문: 모음 끝 → 받침 없음, 자음 끝 → 받침 (휴리스틱)
  if (/[a-zA-Z]/.test(lastChar)) {
    return !/[aeiouAEIOU]/.test(lastChar);
  }

  return false;  // 기타 (이모지·구두점) — 안전하게 받침 없음으로
}

/**
 * 단어 끝의 받침이 ㄹ 인지. (-(으)로 같은 ㄹ-특수 조사용)
 * @param {string} word
 */
export function endsWithRieul(word) {
  if (!word || typeof word !== 'string') return false;
  const trimmed = String(word).trim().replace(/[\s)\]}'"”’.,!?…—–\-]+$/u, '');
  const lastChar = trimmed.slice(-1);
  if (!lastChar) return false;
  const cp = lastChar.codePointAt(0);
  if (cp < HANGUL_BASE || cp > HANGUL_END) return false;
  return ((cp - HANGUL_BASE) % 28) === 8;  // ㄹ 종성 인덱스
}

/**
 * 적절한 조사 선택. (단어 자체는 반환 X — 조사만 반환해서 템플릿에서 붙임)
 * @param {string} word - 조사가 붙을 단어
 * @param {string} pair - "이/가", "을/를", "은/는", "과/와", "아/야", "이여/여", "이라/라", "으로/로"
 * @returns {string}
 */
export function josa(word, pair) {
  // -(으)로 특수 — 받침 없음 OR ㄹ 받침 → 로, 그 외 → 으로
  if (pair === '으로/로') {
    if (!hasFinalConsonant(word) || endsWithRieul(word)) return '로';
    return '으로';
  }
  const forms = PAIRS[pair];
  if (!forms) throw new Error(`Unknown josa pair: ${pair}. Known: ${Object.keys(PAIRS).join(', ')}, 으로/로`);
  return hasFinalConsonant(word) ? forms[0] : forms[1];
}
