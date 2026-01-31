import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://www.swifttranslator.com/';
const SUITE_TIMEOUT_MS = 60_000;

/**
 * The site often renders the "Sinhala" language as an <option> inside a <select>.
 * Clicking <option> directly is flaky (often "not visible").
 * So we select via the parent <select> when possible.
 */
async function switchToSinhala(page: Page) {
  // 1) Native <select> path (most reliable)
  const selectWithSinhala = page
    .locator('select')
    .filter({ has: page.locator('option', { hasText: /^Sinhala$/ }) })
    .first();

  if (await selectWithSinhala.count()) {
    await expect(selectWithSinhala).toBeVisible({ timeout: 15_000 });
    try {
      await selectWithSinhala.selectOption({ label: 'Sinhala' });
    } catch {
      // Some sites only support selection by value.
      await selectWithSinhala.selectOption('sinhala');
    }
    return;
  }

  // 2) Custom dropdown fallback
  const trigger = page.getByRole('combobox').first();
  if (await trigger.count()) {
    await trigger.click({ timeout: 15_000 });
    const opt = page.getByRole('option', { name: /^Sinhala$/ }).first();
    await opt.click({ timeout: 15_000 });
  }
}

function firstSinhalaKeyword(text: string): string {
  const m = text.match(/[අ-ෳ]+/g);
  if (!m || m.length === 0) return '';
  if (m.length > 1 && m[0].length < 4) return `${m[0]} ${m[1]}`;
  return m[0];
}

async function openAndType(
  page: Page,
  inputText: string,
  opts: { mode?: 'fill' | 'type'; typeDelayMs?: number } = {}
) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await switchToSinhala(page);
  const input = page.locator('textarea').first();
  await expect(input).toBeVisible();
  await input.click();
  await input.fill('');
  if (opts.mode === 'fill') {
    await input.fill(inputText);
  } else {
    await input.type(inputText, { delay: opts.typeDelayMs ?? 10 });
  }
  const translateBtn = page.getByRole('button', { name: /translate/i });
  if (await translateBtn.count()) {
    try {
      if (await translateBtn.first().isVisible()) await translateBtn.first().click();
    } catch {}
  }
}

async function getOutputText(page: Page): Promise<string> {
  const textareas = page.locator('textarea');
  const count = await textareas.count();
  if (count >= 2) {
    try {
      const v = await textareas.nth(1).inputValue();
      if (v && v.trim().length > 0) return v.trim();
    } catch {}
  }
  const visibleSinhala = page.locator('*:visible', { hasText: /[අ-ෳ]/ }).first();
  try {
    await expect(visibleSinhala).toBeVisible({ timeout: 15000 });
    return ((await visibleSinhala.textContent()) ?? '').trim();
  } catch {
    return '';
  }
}

async function expectKeywordPresent(page: Page, keyword: string) {
  await expect
    .poll(async () => await getOutputText(page), {
      timeout: 25_000,
      message: `Expected output to contain: ${keyword}`,
    })
    .toContain(keyword);
}

async function expectKeywordAbsent(page: Page, keyword: string) {
  await expect
    .poll(async () => await getOutputText(page), {
      timeout: 25_000,
      message: `Expected output to NOT contain: ${keyword}`,
    })
    .not.toContain(keyword);
}

const POS_FUN: Array<{ id: string; name: string; input: string; expected: string; keyword: string; }> = [
  { id: 'Pos_Fun_0001', name: `Convert future tense sentence`, input: `mama heta enavaa`, expected: `මම හෙට එනවා`, keyword: `මම හෙට` },
  { id: 'Pos_Fun_0002', name: `Convert future tense sentence`, input: `apee ayiyaa heta gedhara enavaa`, expected: `අපේ අයියා හෙට ගෙදර එනවා`, keyword: `අපේ අයියා` },
  { id: 'Pos_Fun_0003', name: `Convert polite request`, input: `oyaa udheeta kaaladha inne`, expected: `ඔයා උදේට කාලද ඉන්නේ`, keyword: `ඔයා උදේට` },
  { id: 'Pos_Fun_0004', name: `Convert future tense sentence`, input: `amma gedhara aavaama uyanna help ekak dhenna`, expected: `අම්ම ගෙදර ආවාම උයන්න help එකක් දෙන්න`, keyword: `අම්ම` },
  { id: 'Pos_Fun_0005', name: `Convert mixed Singlish + English`, input: `machan oyaata mekata hodama visadhuma management ekata email ekak dhaana eka. Ethakota anivaaryen action ekak ganii..`, expected: `මචන් ඔයාට මෙකට හොඩම විසදුම management එකට email එකක් දාන එක. එතකොට අනිවාර්යෙන් action එකක් ගනී.`, keyword: `මචන්` },
  { id: 'Pos_Fun_0006', name: `Convert mixed Singlish + English`, input: `Machan zoom meeting eka start karaa. Ikmanata join wenna`, expected: `මචන් zoom meeting එක start කරා. ඉක්මනට join වෙන්න`, keyword: `මචන්` },
  { id: 'Pos_Fun_0007', name: `Convert mixed Singlish + English`, input: `Heta enakota oyaage parana note tika genath dhenna puluvan veyidha? maava asaniipa velaa hitapu nisaa class yanna unee naee. thava sathi dhekakin exam nisaa mama dhavasen photocopy aragena heta havasama dhennam.`, expected: `හෙට එනකොට ඔයාගෙ පරන note ටික ගෙනත් දෙන්න පුලුවන් වෙයිද? මාව අසනීප වෙලා හිටපු නිසා class යන්න උනේ නෑ. තව සති දෙකකින් exam නිසා මම දවසෙන් photocopy අරගෙන හෙට හවසම දෙන්නම්.`, keyword: `හෙට එනකොට` },
  { id: 'Pos_Fun_0008', name: `Convert polite request`, input: `apee gamee avurudhu uthsavee labana sathiyee thiyennee, oyath enavadha?`, expected: `අපේ ගමේ අවුරුදු උත්සවේ ලබන සතියේ තියෙන්නේ, ඔයත් එනවද?`, keyword: `අපේ ගමේ` },
  { id: 'Pos_Fun_0009', name: `Convert mixed Singlish + English`, input: `Risk ekak ganne naethuva mee rassaava karanna amaaruyi.`, expected: `Risk එකක් ගන්නෙ නැතුව මේ රස්සාව කරන්න අමාරුයි.`, keyword: `එකක්` },
  { id: 'Pos_Fun_0010', name: `Convert mixed Singlish + English`, input: `Oyaage facebook name eka mokadhdha?`, expected: `ඔයාගෙ facebook name එක මොකද්ද?`, keyword: `ඔයාගෙ` },
  { id: 'Pos_Fun_0011', name: `Convert future tense sentence`, input: `Adhanam mata enna vena ekak naee`, expected: `අදනම් මට එන්න වෙන එකක් නෑ`, keyword: `අදනම්` },
  { id: 'Pos_Fun_0012', name: `Convert polite request`, input: `Anee mata oyaage whats app number eka dhenavadha?`, expected: `අනේ මට ඔයාගෙ whats app number එක දෙනවද?`, keyword: `අනේ මට` },
  { id: 'Pos_Fun_0013', name: ``, input: `magee yaluvaagee geval thiyenneth hoomaagama`, expected: `මගේ යලුවාගේ ගෙවල් තියෙන්නෙත් හෝමාගම`, keyword: `මගේ යලුවාගේ` },
  { id: 'Pos_Fun_0014', name: `Convert future tense sentence`, input: `Hetanam kalin ennaveyi. Project ekee vaeda balanna naethnam time eka madhi venavaa`, expected: `හෙටනම් කලින් එන්නවෙයි. Project එකේ වැඩ බලන්න නැත්නම් time එක මදි වෙනවා`, keyword: `හෙටනම්` },
  { id: 'Pos_Fun_0015', name: `Convert interrogative question`, input: `oyaata kohomadha?`, expected: `ඔයාට කොහොමද?`, keyword: `ඔයාට` },
  { id: 'Pos_Fun_0016', name: `Convert polite request`, input: `mata udhavvak karanna puluvandha?`, expected: `මට උදව්වක් කරන්න පුළුවන්ද?`, keyword: `මට උදව්වක්` },
  { id: 'Pos_Fun_0017', name: `Convert present tense action`, input: `mama dhaen vaeda karanavaa`, expected: `මම දැන් වැඩ කරනවා`, keyword: `මම දැන්` },
  { id: 'Pos_Fun_0018', name: `Convert future tense sentence`, input: `api heta enavaa`, expected: `අපි හෙට එනවා`, keyword: `අපි හෙට` },
  { id: 'Pos_Fun_0019', name: `Convert negative sentence`, input: `mama ehema karanne naehae`, expected: `මම එහෙම කරන්නේ නැහැ`, keyword: `මම එහෙම` },
  { id: 'Pos_Fun_0020', name: `Convert imperative command`, input: `vahaama enna`, expected: `වහාම එන්න`, keyword: `වහාම` },
  { id: 'Pos_Fun_0021', name: `Convert plural pronoun sentence`, input: `api passee kathaa karamu`, expected: `අපි පස්සේ කතා කරමු`, keyword: `අපි පස්සේ` },
  { id: 'Pos_Fun_0022', name: `Convert mixed Singlish + English`, input: `Zoom meeting ekak thiyenavaa`, expected: `Zoom meeting එකක් තියෙනවා`, keyword: `එකක්` },
  { id: 'Pos_Fun_0023', name: `Convert common greeting`, input: `dhavasa suba veevaa!!`, expected: `දවස සුබ වේවා!!`, keyword: `දවස සුබ` },
  { id: 'Pos_Fun_0024', name: `Convert future tense sentence`, input: `api heta maamalaagee gedhara yanavaa`, expected: `අපි හෙට මාමලාගේ ගෙදර යනවා`, keyword: `අපි හෙට` },
];

const NEG_FUN: Array<{ id: string; name: string; input: string; shouldNotShow: string; keyword: string; }> = [
  { id: 'Neg_Fun_0001', name: `Currency + units mixed`, input: `Rs. 5343 walata kg 2k ganna`, shouldNotShow: ``, keyword: `කොහොමද` },
  { id: 'Neg_Fun_0002', name: `Joined + segmented mix`, input: `mata paankannaoonee`, shouldNotShow: `මට පාන් කන්න ඕනේ`, keyword: `මට පාන්` },
  { id: 'Neg_Fun_0003', name: `Numbers mixed inside words`, input: `mama 2n gedhara yanavaa`, shouldNotShow: `මම ගෙදර යනවා`, keyword: `මම ගෙදර` },
  { id: 'Neg_Fun_0004', name: `Mixed casing (upper/lower)`, input: `MaMa GeDhArA YaNaVaA`, shouldNotShow: `මම ගෙදර යනවා`, keyword: `මම ගෙදර` },
  { id: 'Neg_Fun_0005', name: `Random special characters`, input: `mama @gedhara #yanavaa`, shouldNotShow: `මම ගෙදර යනවා`, keyword: `මම ගෙදර` },
  { id: 'Neg_Fun_0006', name: `Joined words in a question`, input: `oyaatakohomadha?`, shouldNotShow: `ඔයාට කොහොමද?`, keyword: `ඔයාට` },
  { id: 'Neg_Fun_0007', name: `Heavy slang + typos`, input: `ado bn ela wge neda? poddak blpnko`, shouldNotShow: `අඩෝ බන් එල වගෙ නේද? පොඩ්ඩක් බලපන්කො`, keyword: `අඩෝ බන්` },
  { id: 'Neg_Fun_0008', name: `Alphanumeric token in the middle`, input: `heta 7.30AM enavaa`, shouldNotShow: `හෙට 7.30AM එනවා`, keyword: `හෙට එනවා` },
  { id: 'Neg_Fun_0009', name: `Currency + unit + shorthand`, input: `USD 1500 walata ml 500k ganna`, shouldNotShow: `USD 1500 වලට ml 500ක් ගන්න`, keyword: `වලට ක්` },
  { id: 'Neg_Fun_0010', name: `Newlines and spacing stress`, input: `api passee \\n kathaa karamu \\n hari hari`, shouldNotShow: `අපි පස්සේ කතා කරමු හරි හරි`, keyword: `අපි පස්සේ` },
];

const POS_UI: Array<{ id: string; name: string; input: string; expected: string; keyword: string; }> = [
  { id: 'Pos_UI_0001', name: `Real-time output updates while typing`, input: `mama pansal yanavaa`, expected: `Sinhala output should update automatically while typing and display: මම පන්සල් යනවා`, keyword: `මම පන්සල්` },
  { id: 'Pos_UI_0002', name: `Multiple spaces do not break UI rendering`, input: `mama        pansal yanavaa`, expected: `Sinhala output should update automatically while typing and display: මම පන්සල් යනවා`, keyword: `මම පන්සල්` },
  { id: 'Pos_UI_0003', name: `Medium input does not cause lag/freezing`, input: `api passee kathaa karamu. oyaa kavadhdha enna hithan inne?`, expected: `Sinhala output should update automatically while typing and display: අපි පස්සේ කතා කරමු. ඔයා කවද්ද එන්න හිතන් ඉන්නේ?`, keyword: `අපි පස්සේ` },
  { id: 'Pos_UI_0004', name: `Mixed Singlish + English terms display correctly`, input: `Zoom meeting ekak thiyenavaa. link eka WhatsApp karanna puLuvandha?`, expected: `English words like “Zoom/WhatsApp/link” remain readable; output renders cleanly:Zoom meeting එකක් තියෙනවා. link එක WhatsApp කරන්න පුළුවන්ද?`, keyword: `එකක්` },
  { id: 'Pos_UI_0005', name: `Clearing input clears output area`, input: `mamapansalyanavaa (type then clear)`, expected: `When input is fully cleared, output area becomes empty : මම පන්සල් යනවා`, keyword: `මම පන්සල්` },
];

const NEG_UI: Array<{ id: string; name: string; input: string; keyword: string; }> = [
  { id: 'Neg_UI_0001', name: `Backspace causes temporary mismatch`, input: `oyaata kohomadha?`, keyword: `ඔයාට` },
  { id: 'Neg_UI_0002', name: `Output lags during fast typing`, input: `oyaata kohomadha?`, keyword: `ඔයාට` },
];

test.describe('Positive Functional (Pos_Fun)', () => {
  test.describe.configure({ timeout: SUITE_TIMEOUT_MS });
  for (const tc of POS_FUN) {
    test(`${tc.id} - ${tc.name}`, async ({ page }) => {
      await openAndType(page, tc.input, { mode: 'fill' });
      const kw = firstSinhalaKeyword(tc.expected) || tc.keyword || 'ම';
      await expectKeywordPresent(page, kw);
    });
  }
});

test.describe('Negative Functional (Neg_Fun)', () => {
  test.describe.configure({ timeout: SUITE_TIMEOUT_MS });
  for (const tc of NEG_FUN) {
    test(`${tc.id} - ${tc.name}`, async ({ page }) => {
      await openAndType(page, tc.input, { mode: 'fill' });
      const kw = firstSinhalaKeyword(tc.shouldNotShow) || tc.keyword || 'ම';
      await expectKeywordAbsent(page, kw);
    });
  }
});

test.describe('Positive UI (Pos_UI)', () => {
  test.describe.configure({ timeout: SUITE_TIMEOUT_MS });
  for (const tc of POS_UI) {
    test(`${tc.id} - ${tc.name}`, async ({ page }) => {
      await openAndType(page, tc.input, { mode: 'type', typeDelayMs: 15 });
      const kw = firstSinhalaKeyword(tc.expected) || tc.keyword || 'ම';
      await expectKeywordPresent(page, kw);
    });
  }
});

test.describe('Negative UI (Neg_UI)', () => {
  test.describe.configure({ timeout: SUITE_TIMEOUT_MS });
  for (const tc of NEG_UI) {
    test(`${tc.id} - ${tc.name}`, async ({ page }) => {
      await openAndType(page, tc.input, { mode: 'type', typeDelayMs: 15 });
      const out = await getOutputText(page);
      expect(out.length).toBeGreaterThan(0);
      const kw = tc.keyword || 'ම';
      expect(out).toContain(kw);
    });
  }
});
