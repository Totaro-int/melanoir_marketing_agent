import { assertProvider } from '../provider.mjs';

export const provider = assertProvider({
  id: 'anthropic',
  byok: false,

  async generateCopy() {
    throw new Error(
      'anthropic provider 는 직접 호출되지 않습니다. ' +
      'generate.mjs 가 copy-spec.json 을 작성하면 copywriter 에이전트가 처리합니다.'
    );
  },

  async generateImage() {
    throw new Error('anthropic provider 는 이미지 생성을 지원하지 않습니다.');
  },

  healthcheck() {
    return { ok: true, reason: 'copy via copywriter subagent (no API key needed)' };
  },
});
