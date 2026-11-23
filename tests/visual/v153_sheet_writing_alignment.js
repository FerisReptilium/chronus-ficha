'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = process.env.CHRONUS_PREVIEW_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = path.join('artifacts', 'v153-sheet-writing-alignment');

async function inspectViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#view-sheet').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      document.querySelector('#view-sheet').classList.add('is-active');
      document.querySelector('#page-1').classList.add('is-active');
      const overlay = document.querySelector('#overlay');
      const list = document.createElement('input');
      list.className = 'list-marker-input';
      list.setAttribute('aria-label', 'QA alinhamento habilidade');
      list.style.left = '48%'; list.style.top = '58%'; list.style.width = '20%'; list.style.height = '24px';
      document.querySelector('#skillsLayer').append(list);
      const table = document.createElement('input');
      table.className = 'table-input';
      table.setAttribute('aria-label', 'QA alinhamento equipamento');
      table.style.left = '4%'; table.style.top = '74%'; table.style.width = '20%'; table.style.height = '31px';
      document.querySelector('#equipmentLayer').append(table);
      const notes = document.createElement('textarea');
      notes.className = 'table-input formula-notes';
      notes.setAttribute('aria-label', 'QA alinhamento notas');
      notes.style.left = '70%'; notes.style.top = '82%'; notes.style.width = '20%'; notes.style.height = '47px';
      document.querySelector('#formulasLayer').append(notes);
      const pageTwo = document.querySelector('#page-2');
      pageTwo.style.display = 'block';
      pageTwo.classList.add('is-active');
      document.querySelector('#page2Formulas input')?.setAttribute('aria-label', 'QA fórmula página dois');
    });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(150);

    const metrics = await page.evaluate(() => {
      const read = selector => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing field ${selector}`);
        const style = getComputedStyle(element);
        return {
          fontSize: parseFloat(style.fontSize),
          lineHeight: parseFloat(style.lineHeight),
          paddingTop: parseFloat(style.paddingTop),
          paddingBottom: parseFloat(style.paddingBottom),
          boxHeight: element.getBoundingClientRect().height
        };
      };
      const link = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .find(item => item.href.includes('sheet-writing-alignment-v15.css'));
      return {
        stylesheetLoaded: Boolean(link?.sheet),
        identity: read('[data-bind="identity.name"]'),
        personality: read('[data-bind="personalities.0"]'),
        conditions: read('[data-bind="conditions"]'),
        equipment: read('.list-marker-input'),
        table: read('#equipmentLayer .table-input'),
        formulaNotes: read('#formulasLayer .formula-notes'),
        history: read('.history-expanded textarea'),
        pageTwoInput: read('#page2Formulas input')
      };
    });

    assert(metrics.stylesheetLoaded, `${name}: alignment stylesheet did not load`);
    for (const key of ['identity', 'equipment', 'table']) {
      const ratio = metrics[key].lineHeight / metrics[key].fontSize;
      assert(ratio >= 0.95 && ratio <= 1.08, `${name}: ${key} single-line text metric is not normalized: ${JSON.stringify(metrics[key])}`);
      assert(metrics[key].boxHeight > 0, `${name}: ${key} field has no layout box`);
    }
    for (const key of ['personality', 'conditions', 'formulaNotes', 'history']) {
      assert(metrics[key].lineHeight > metrics[key].fontSize, `${name}: ${key} does not preserve a ruled multiline rhythm`);
      assert(metrics[key].paddingTop >= 0, `${name}: ${key} has invalid top padding`);
    }

    await page.locator('[data-bind="identity.name"]').fill('Personagem — escrita alinhada');
    await page.locator('[data-bind="personalities.0"]').fill('Texto de teste sobre a pauta\nSegunda linha alinhada');
    await page.locator('[data-bind="conditions"]').fill('Condição de teste\nOutra condição');
    await page.locator('[data-bind="equipmentImportant"]').fill('Equipamento de teste\nSegunda anotação');
    await page.locator('#page2Formulas input').first().fill('Fórmula alinhada');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}-page1.png`), fullPage: false });
    await page.evaluate(() => {
      document.querySelector('#page-1').classList.remove('is-active');
      document.querySelector('#page-2').classList.add('is-active');
    });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}-page2.png`), fullPage: false });

    console.log(`PASS ${name}: ${JSON.stringify(metrics)}`);
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await inspectViewport(browser, 'desktop', { width: 1440, height: 1000 });
    await inspectViewport(browser, 'mobile', { width: 390, height: 844 });
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
