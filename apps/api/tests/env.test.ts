/** The API must boot even when the optional AI key is malformed; critical secrets stay strict. */
const load = (env: Record<string, string | undefined>) => {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    let mod: typeof import('../src/config/env') | undefined;
    let exited = false;
    jest.isolateModules(() => {
      try { mod = require('../src/config/env'); } catch { exited = true; }
    });
    return { env: mod?.env, exited, warned: warn.mock.calls.flat().join(' ') };
  } finally {
    exit.mockRestore(); warn.mockRestore(); err.mockRestore();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
};

describe('environment loading', () => {
  it.each([['empty', ''], ['too short', 'abc'], ['whitespace', '   ']])('boots with AI off when AI_API_KEY is %s', (_n, value) => {
    const r = load({ AI_API_KEY: value });
    expect(r.exited).toBe(false);
    expect(r.env?.AI_API_KEY).toBeUndefined();
  });
  it('says why, without printing the value', () => {
    const r = load({ AI_API_KEY: 'short-1' });
    expect(r.warned).toMatch(/AI_API_KEY ignored.*7 characters/);
    expect(r.warned).not.toContain('short-1');
  });
  it('accepts a valid key, also when wrapped in quotes or spaces', () => {
    expect(load({ AI_API_KEY: 'sk-ant-api03-abcdefghij' }).env?.AI_API_KEY).toBe('sk-ant-api03-abcdefghij');
    expect(load({ AI_API_KEY: '  "sk-ant-api03-abcdefghij"  ' }).env?.AI_API_KEY).toBe('sk-ant-api03-abcdefghij');
  });
  it('still refuses to boot without a strong JWT_SECRET', () => {
    expect(load({ JWT_SECRET: 'too-short' }).exited).toBe(true);
  });
});
