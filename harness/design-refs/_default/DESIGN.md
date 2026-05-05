# Default Design System (Fallback)

회사 프로필에 `imageStyle`이 없고 `designRef`도 지정되지 않은 경우 적용되는
최소 품질 보장 디자인 시스템. 2-C 기준을 강제하는 중립적 레이아웃 DNA.

---

## 1. Visual Theme & Atmosphere

깔끔하고 신뢰감 있는 편집 스타일. 브랜드 색상(company-profile)을 중심으로,
여백·타이포그래피·레이어링으로 완성도를 높인다. 색상은 회사 프로필을 따르고,
이 파일은 레이아웃 DNA만 제공한다.

**Key Characteristics:**
- 헤드라인 weight 300, letter-spacing -2px~-4px (숫자·통계 전용)
- 배경 flat 단색 금지 — radial glow 또는 mesh gradient 반드시 적용
- shadow: `rgba(50,50,93,0.12) 0px 8px 24px -8px, rgba(0,0,0,0.07) 0px 4px 12px -4px`
- border-radius: 0px (sharp) 또는 8px (soft) — 혼합 금지, 하나만 선택
- 여백 방향: airy — padding 60px+ (상하), 48px+ (좌우)
- 구성: editorial (중앙 정렬 + 좌우 여백 대비)

---

## 2. Color Palette & Roles

색상은 `imageContext.visual.colors.*` (company-profile)를 우선 사용한다.
아래는 company-profile에 색상이 없을 때만 적용하는 폴백 팔레트.

- **Primary**: `#0F172A` (deep navy — 헤드라인, 강렬한 배경)
- **Background (light)**: `#F8FAFC` (밝은 캔버스)
- **Background (dark)**: `#0F172A` (어두운 캔버스)
- **Accent**: `#3B82F6` (강조 — bar, dot, gradient)
- **Accent secondary**: `#533AFD` (보조 강조)
- **Body text (light bg)**: `#3D526B`
- **Body text (dark bg)**: `rgba(255,255,255,0.75)`
- **Caption**: `#64748D`
- **Border**: `#E5EDF5`

---

## 3. Typography

- **Font stack**: `'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', system-ui, sans-serif`
- Google Fonts URL 금지 (offline 환경 대응)

| Role | Size | Weight | Letter-spacing |
|------|------|--------|----------------|
| Hero stat | 96~130px | 300 | -3px~-5px |
| Sub stat / label | 28~36px | 300~400 | -0.5px~-1px |
| Eyebrow | 16~20px | 500 | +0.1em (uppercase) |
| Bullet text | 26~32px | 400 | -0.3px |
| Brand watermark | 20~24px | 400 | +0.04em, opacity 0.3~0.4 |

규칙:
- Hero stat은 반드시 300(아주 가볍게) — 숫자가 크면 굵을 필요 없다
- Eyebrow는 500으로 Hero stat과 대비 강조
- 동일 weight 연속 금지

---

## 4. Spacing & Layout

- **Padding**: 상 72px, 하 64px, 좌우 56px (portrait 기준)
- **요소 간격**: section 간 40px, bullet 간 20px
- **Hero stat 위치**: 세로 중앙 기준 위쪽 1/3 지점
- **Brand watermark**: 우하단 또는 좌하단, margin 24px

---

## 5. Backgrounds & Depth

배경이 단색 flat이면 반드시 아래 중 하나로 업그레이드한다.

**Light canvas (권장)**
```css
background:
  radial-gradient(ellipse 70% 50% at 80% 10%, rgba(59,130,246,0.08) 0%, transparent 60%),
  radial-gradient(ellipse 50% 40% at 5% 90%, rgba(83,58,253,0.05) 0%, transparent 55%),
  #F8FAFC;
```

**Dark canvas**
```css
background:
  radial-gradient(ellipse 60% 55% at 50% 25%, rgba(59,130,246,0.18) 0%, transparent 60%),
  radial-gradient(ellipse 45% 40% at 10% 80%, rgba(83,58,253,0.12) 0%, transparent 45%),
  #0F172A;
```

**Premium mesh (선택)**
```css
background:
  radial-gradient(at 0% 0%, rgba(59,130,246,0.12) 0, transparent 50%),
  radial-gradient(at 100% 0%, rgba(83,58,253,0.10) 0, transparent 50%),
  radial-gradient(at 100% 100%, rgba(59,130,246,0.08) 0, transparent 50%),
  #F8FAFC;
```

---

## 6. Decorative Elements (최소 2개 필수)

1. **Accent bar** (상단): 4px 높이, `linear-gradient(90deg, #3B82F6, #533AFD)`, z-index 10
2. **Divider**: 48px × 2px, accent 색, opacity 0.4
3. **Eyebrow label**: uppercase, 16~20px, letter-spacing 0.1em
4. **Stat card badge**: 흰 배경 + `border: 1px solid #E5EDF5` + `box-shadow: 0 4px 16px rgba(50,50,93,0.12), 0 1px 6px rgba(0,0,0,0.07)`
5. **Ghost number**: Hero stat을 opacity 0.04~0.06으로 배경에 200~260px으로 깔기
6. **Thin border**: `border: 1px solid rgba(59,130,246,0.12)`, border-radius 0

---

## 7. Shadow System

```css
/* 카드·배지 */
box-shadow: rgba(50,50,93,0.12) 0px 8px 24px -8px, rgba(0,0,0,0.07) 0px 4px 12px -4px;

/* 플로팅 요소 */
box-shadow: rgba(50,50,93,0.18) 0px 16px 40px -12px, rgba(0,0,0,0.10) 0px 8px 20px -8px;
```

---

## 8. Anti-Patterns (절대 금지)

- ❌ 단색 flat 배경 + 장식 없음
- ❌ Hero stat 60px 이하
- ❌ 모든 텍스트 동일 weight
- ❌ 텍스트가 카드 면적 70% 초과
- ❌ accent 색 미사용
- ❌ 상하좌우 동일 padding

---

## 9. Agent Prompt Guide

### Quick Color Reference (company-profile 없을 때 폴백)
- Background (light): `#F8FAFC`
- Background (dark): `#0F172A`
- Heading text: `#0F172A`
- Body text: `#3D526B`
- Caption: `#64748D`
- Accent (bar/dot/gradient): `#3B82F6`
- Accent secondary: `#533AFD`
- Border: `#E5EDF5`

> **우선순위**: `imageContext.visual.colors.*` 값이 있으면 위 값 대신 company-profile 값을 사용한다.

### Layout DNA
- Letter-spacing: Hero stat -3px~-5px / Eyebrow +0.1em
- Shadow formula: `rgba(50,50,93,0.12) 0px 8px 24px -8px, rgba(0,0,0,0.07) 0px 4px 12px -4px`
- Border-radius: 0px (sharp) or 8px (soft) — pick one
- Padding: 72px top, 64px bottom, 56px sides (portrait)
- Decorative elements: 최소 2개 (accent bar + divider, or eyebrow + stat badge)

### Example HTML Snippets

**Light canvas card (Hero stat)**
```html
<div style="
  background:
    radial-gradient(ellipse 70% 50% at 80% 10%, rgba(59,130,246,0.08) 0%, transparent 60%),
    radial-gradient(ellipse 50% 40% at 5% 90%, rgba(83,58,253,0.05) 0%, transparent 55%),
    #F8FAFC;
  padding: 72px 56px 64px;
  position: relative; overflow: hidden;
">
  <!-- accent bar -->
  <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#3B82F6,#533AFD);z-index:10;"></div>
  <!-- eyebrow -->
  <div style="font-size:16px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#3B82F6;margin-bottom:24px;">BEFORE → AFTER</div>
  <!-- hero stat -->
  <div style="font-size:112px;font-weight:300;letter-spacing:-4px;color:#0F172A;line-height:1;">5일 → 1.8일</div>
  <!-- sub label -->
  <div style="font-size:32px;font-weight:300;letter-spacing:-0.5px;color:#3D526B;margin-top:16px;">정산 주기 자동 단축</div>
  <!-- divider -->
  <div style="width:48px;height:2px;background:#3B82F6;opacity:0.4;margin:40px 0;"></div>
  <!-- bullets -->
  <div style="font-size:28px;font-weight:400;letter-spacing:-0.3px;color:#3D526B;line-height:1.6;">...</div>
  <!-- brand watermark -->
  <div style="position:absolute;bottom:24px;right:24px;font-size:20px;font-weight:400;letter-spacing:0.04em;opacity:0.35;color:#0F172A;">BrandName</div>
</div>
```
