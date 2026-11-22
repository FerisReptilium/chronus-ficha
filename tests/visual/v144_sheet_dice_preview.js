'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const origin = process.env.CHRONUS_PREVIEW_ORIGIN || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.CHRONUS_DICE_PREVIEW_OUTPUT || 'artifacts/v144-sheet-dice');
const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};

const supabaseMock = `
(() => {
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'felipe@example.com' };
  const profile = { id: user.id, display_name: 'Felipe Ribeiro', email: user.email, role: 'player' };
  const character = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    user_id: user.id,
    name: 'Mara',
    updated_at: '2026-09-04T18:00:00Z',
    data: {
      identity: { name: 'Mara', player: 'Felipe Ribeiro', tradition: 'Ordem de Hermes', concept: 'Investigadora', profession: 'Criptógrafa', chronicle: 'CHRONUS' },
      personalities: ['Analítica <img data-xss src=x onerror=alert(1)>', 'Obstinada'],
      attributes: { 'Força': 'd6', 'Vigor': 'd6', 'Destreza': 'd8', 'Razão': 'd10', 'Astúcia': 'd8', 'Perseverança': 'd8', 'Manipulação': 'd4', 'Presença': 'd6', 'Vontade': 'd8' },
      illumination: 'd4', protection: '', pain: false, conditions: '', equipmentImportant: '', xp: { current: '', spent: '' },
      markers: { 'determination.0': 'filled', 'determination.1': 'filled', 'determination.2': 'empty' },
      paradox: 8,
      lists: {
        skills: [{ marker: 'filled', text: 'Investigação <script data-xss>alert(2)</script>' }, { marker: 'empty', text: 'Ocultismo' }],
        advantages: [], equipment: [], formulas: [], arcana: {}
      },
      page2: { formulas: [], inventory: [], history: '' }, activePage: 'page-1'
    }
  };

  function queryFor(table) {
    let updatePayload = null;
    const result = () => table === 'profiles' ? profile : table === 'characters' ? character : null;
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      update(payload) { updatePayload = payload; return query; },
      insert() { return query; },
      maybeSingle: async () => ({ data: result(), error: null }),
      single: async () => {
        if (updatePayload?.data) character.data = updatePayload.data;
        return { data: updatePayload ? { updated_at: new Date().toISOString() } : result(), error: null };
      },
      then(resolve, reject) { return Promise.resolve({ data: result() ? [result()] : [], error: null }).then(resolve, reject); }
    };
    return query;
  }

  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      signOut: async () => ({ error: null })
    },
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'preview without portrait' } }) }) },
    from: table => queryFor(table)
  };
  window.supabase = { createClient: () => client };
})();
`;

function watchErrors(page) {
  const errors = { console: [], page: [] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  return errors;
}

async function runMode(browser, mode, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('dialog', dialog => dialog.accept());
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseMock }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  const errors = watchErrors(page);
  const response = await page.goto(`${origin}/#/sheet`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.chronusDice === 'v1.3.5-preview');
  await page.waitForFunction(() => window.ChronusSheetEngine?.getRollProfile?.().characterName === 'Mara');

  const readResource = async key => page.locator(`[data-resource-counter="${key}"] input`).inputValue();
  const setResource = async (key, value) => {
    const input = page.locator(`[data-resource-counter="${key}"] input`);
    await input.fill(String(value));
    await input.dispatchEvent('change');
  };
  const selectAttribute = async (name, die) => page.locator(`[aria-label="${name}: dado do atributo"]`).selectOption(die);
  const selectIllumination = async die => page.locator(`[aria-label="Iluminação ${die}"]`).click();
  const readResourceMax = async key => page.locator(`[data-resource-counter="${key}"] [data-resource-max]`).textContent();

  const initialResources = {
    determination: await readResource('determination'),
    determinationMax: await readResourceMax('determination'),
    mana: await readResource('mana'),
    manaMax: await readResourceMax('mana'),
    wounds: await readResource('wounds'),
    woundsMax: await readResourceMax('wounds')
  };
  if (initialResources.determination !== '2' || initialResources.determinationMax !== '/ 8') {
    throw new Error(`${mode}: derived Determination maximum failed: ${JSON.stringify(initialResources)}`);
  }
  if (initialResources.mana !== '10' || initialResources.manaMax !== '/ 10') {
    throw new Error(`${mode}: initial Mana maximum failed: ${JSON.stringify(initialResources)}`);
  }
  if (initialResources.wounds !== '0' || initialResources.woundsMax !== '/ 11') {
    throw new Error(`${mode}: derived Wounds maximum failed: ${JSON.stringify(initialResources)}`);
  }

  await page.locator('#chronus-dice-launcher').click();
  await page.locator('#dice-tab-guided').click();
  await page.locator('#dice-guided-attribute').selectOption('Razão');
  await page.locator('#dice-guided-personality').selectOption({ index: 1 });
  await page.locator('#dice-guided-skill').selectOption({ index: 1 });
  await page.locator('[data-group="guided-difficulty"][data-value="6"]').click();
  await page.locator('label.dice-toggle:has(#dice-guided-determination)').click();

  const before = await page.evaluate(() => ({
    summary: document.getElementById('dice-guided-summary').textContent,
    status: document.getElementById('dice-sheet-status').textContent,
    profile: window.ChronusSheetEngine.getRollProfile(),
    xss: document.querySelectorAll('#chronus-dice-root [data-xss], #chronus-dice-root script, #chronus-dice-root [onerror]').length
  }));
  await page.locator('#dice-guided-roll').click();
  await page.waitForSelector('#dice-result-content', { state: 'visible' });
  const afterDetermination = await page.evaluate(() => window.ChronusSheetEngine.getRollProfile());

  // Recursos dinâmicos: preservar valores parciais e recalcular valores cheios.
  await selectAttribute('Perseverança', 'd10');
  await selectAttribute('Vontade', 'd10');
  const determinationPartial = { current: await readResource('determination'), max: await readResourceMax('determination') };
  await setResource('determination', 10);
  await selectAttribute('Perseverança', 'd6');
  const determinationFull = { current: await readResource('determination'), max: await readResourceMax('determination') };
  await selectAttribute('Perseverança', 'd12');
  await selectAttribute('Vontade', 'd12');
  const determinationD12 = { current: await readResource('determination'), max: await readResourceMax('determination') };

  await selectIllumination('d8');
  const manaExpanded = { current: await readResource('mana'), max: await readResourceMax('mana') };
  await setResource('mana', 7);
  await selectIllumination('d10');
  const manaPartial = { current: await readResource('mana'), max: await readResourceMax('mana') };
  await setResource('mana', 40);
  await selectIllumination('d12');
  const manaD12 = { current: await readResource('mana'), max: await readResourceMax('mana') };

  await setResource('wounds', 5);
  await selectAttribute('Vigor', 'd8');
  const woundsPartial = { current: await readResource('wounds'), max: await readResourceMax('wounds') };
  await setResource('wounds', 13);
  await selectAttribute('Vigor', 'd12');
  const woundsD12 = { current: await readResource('wounds'), max: await readResourceMax('wounds') };
  const dynamicResources = {
    determinationPartial, determinationFull, determinationD12,
    manaExpanded, manaPartial, manaD12, woundsPartial, woundsD12,
    hasD12Attribute: (await page.evaluate(() => window.ChronusSheetEngine.getRollProfile().attributes.some(item => item.die === 'd12')))
  };

  await page.locator('#dice-tab-paradox').click();
  const paradoxInputValue = await page.locator('#dice-paradox-value').evaluate(element => element.value);
  await page.locator('#dice-paradox-roll').click();
  const afterParadox = await page.evaluate(() => window.ChronusSheetEngine.getRollProfile());
  const layout = await page.evaluate(() => {
    const dialog = document.querySelector('.chronus-dice-dialog').getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      dialogOutsideViewport: dialog.left < -1 || dialog.right > innerWidth + 1 || dialog.top < -1 || dialog.bottom > innerHeight + 1
    };
  });

  await page.screenshot({ path: path.join(outputDir, `${mode}-sheet-dice.png`), fullPage: true });
  if (response?.status() !== 200) throw new Error(`${mode}: preview HTTP ${response?.status()}`);
  if (!before.status.includes('Ficha conectada · Mara')) throw new Error(`${mode}: connected sheet status missing`);
  if (!before.summary.includes('3d10 + 1d12') || !before.summary.includes('Dificuldade final6')) throw new Error(`${mode}: automatic pool calculation failed: ${before.summary}`);
  if (before.profile.determination !== 2 || afterDetermination.determination !== 1) throw new Error(`${mode}: Determination was not consumed exactly once`);
  if (determinationPartial.current !== '1' || determinationPartial.max !== '/ 10') throw new Error(`${mode}: partial Determination was not preserved: ${JSON.stringify(dynamicResources)}`);
  if (determinationFull.current !== '6' || determinationFull.max !== '/ 6') throw new Error(`${mode}: full Determination did not reconcile to the reduced maximum: ${JSON.stringify(dynamicResources)}`);
  if (determinationD12.current !== '12' || determinationD12.max !== '/ 12' || !dynamicResources.hasD12Attribute) throw new Error(`${mode}: d12 Determination support failed: ${JSON.stringify(dynamicResources)}`);
  if (manaExpanded.current !== '25' || manaExpanded.max !== '/ 25') throw new Error(`${mode}: full Mana did not expand to d8 maximum: ${JSON.stringify(dynamicResources)}`);
  if (manaPartial.current !== '7' || manaPartial.max !== '/ 40') throw new Error(`${mode}: partial Mana was not preserved: ${JSON.stringify(dynamicResources)}`);
  if (manaD12.current !== '60' || manaD12.max !== '/ 60') throw new Error(`${mode}: d12 Mana maximum failed: ${JSON.stringify(dynamicResources)}`);
  if (woundsPartial.current !== '5' || woundsPartial.max !== '/ 13') throw new Error(`${mode}: partial Wounds were not preserved: ${JSON.stringify(dynamicResources)}`);
  if (woundsD12.current !== '17' || woundsD12.max !== '/ 17') throw new Error(`${mode}: d12 Wounds maximum failed: ${JSON.stringify(dynamicResources)}`);
  if (paradoxInputValue !== '8') throw new Error(`${mode}: Paradox input did not sync from live value`);
  if (afterParadox.paradox !== 5) throw new Error(`${mode}: Paradox discharge did not update the sheet`);
  if (before.xss !== 0) throw new Error(`${mode}: sheet labels created executable DOM`);
  if (layout.horizontalOverflow || layout.dialogOutsideViewport) throw new Error(`${mode}: dice dialog layout regression`);
  if (errors.console.length || errors.page.length) throw new Error(`${mode}: browser errors detected: ${JSON.stringify(errors)}`);

  await context.close();
  return { httpStatus: response?.status() || null, initialResources, dynamicResources, before, afterDetermination, afterParadox, layout, errors };
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const launchOptions = { headless: true };
  if (process.env.CHRONUS_CHROMIUM_EXECUTABLE) launchOptions.executablePath = process.env.CHRONUS_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(launchOptions);
  try {
    const results = {};
    for (const [mode, viewport] of Object.entries(viewports)) results[mode] = await runMode(browser, mode, viewport);
    fs.writeFileSync(path.join(outputDir, 'qa.json'), `${JSON.stringify(results, null, 2)}\n`);
    console.log('v1.4.4 sheet-to-dice desktop/mobile visual QA: PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
