// ==UserScript==
// @name         HUNTER×HUNTER 2026 GAS連携
// @namespace    matsui-hunterhunter2026
// @version      1.0.0
// @description  #row=Noで開始。GASから公演日時を取得し、同一アカウントの次の行へ続行。画像認証は手動。
// @match        https://rh06-71.github.io/hunterhunter2026/*
// @match        https://l-tike.com/*
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @inject-into  content
// @run-at       document-end
// @noframes
// ==/UserScript==

(async function () {
  'use strict';
  if (window.top !== window.self) return;
  const VERSION = '1.0.0';
  const SITE = 'hunterhunter2026';
  const BASE = 'https://l-tike.com/st1/4y0msbhkq0f01qpc1j6j';
  const START = 'https://rh06-71.github.io/hunterhunter2026/';
  const OFFICIAL = 'https://webview.shonenjump.com/special/2026/hunter_stage4_1013/';
  const STORE = 'hunterhunter2026_v1';
  const CONFIG = STORE + '_config', DONE = STORE + '_done', BIND = STORE + '_run';
  const TTL = 60 * 60 * 1000;
  const AUTO_SUBMIT = true;
  const AUTO_NEXT_SAME_ACCOUNT = true;
  const gm = typeof GM !== 'undefined' ? GM : null;
  let state, panel, detail, controls, stopped = false, busy = false, queued = false;
  const aborter = new AbortController();
  const read = async (key, fallback = null) => {
    if (typeof gm?.getValue === 'function') return gm.getValue(key, fallback);
    if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    throw Error('GM保存APIに対応したUserscriptsまたはTampermonkeyで実行してください');
  };
  const write = async (key, value) => {
    if (typeof gm?.setValue === 'function') return gm.setValue(key, value);
    if (typeof GM_setValue === 'function') return GM_setValue(key, value);
    throw Error('GM保存APIがありません');
  };
  const save = () => write(STORE, state);
  const norm = value => String(value ?? '').normalize('NFKC').replace(/[\s\u200b]+/g, '');
  const text = el => el?.innerText || el?.textContent || '';
  const label = el => norm(el?.tagName === 'INPUT' ? el.value : text(el));
  const visible = el => !!el?.isConnected && el.getClientRects().length > 0 &&
    getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  const enabled = el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' &&
    !/disabled|noSelectSeatType/.test(String(el.className)) && getComputedStyle(el).pointerEvents !== 'none';
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector)).filter(visible);
  function one(items, name) {
    if (items.length > 1) throw Error(name + 'が複数あります。自動選択を停止しました');
    return items[0] || null;
  }
  function action(names, root = document) {
    return one(all('button,a,input[type="button"],input[type="submit"],[role="button"]', root)
      .filter(el => names.map(norm).includes(label(el)) && enabled(el)), names[0]);
  }
  function show(message, error = false) {
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'hunterhunter2026-panel';
      panel.style.cssText = 'position:fixed;right:8px;top:8px;max-width:min(390px,94vw);padding:12px;z-index:2147483647;background:white;color:#18212a;border:2px solid #187856;border-radius:10px;font:14px/1.5 sans-serif;box-shadow:0 3px 12px #0004';
      const title = document.createElement('strong'); title.textContent = 'HUNTER×HUNTER v' + VERSION;
      detail = document.createElement('div'); detail.style.whiteSpace = 'pre-wrap';
      controls = document.createElement('div');
      const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = '自動処理を停止';
      stop.onclick = () => fail(Error('手動で停止しました'));
      panel.append(title, detail, controls, stop); document.body.appendChild(panel);
    }
    const title = state?.entry ? 'No.' + state.no + '／' + state.entry.dateText + ' ' + state.entry.timeText + '\n' : '';
    if (detail.textContent !== title + message) detail.textContent = title + message;
    const color = error ? 'rgb(181, 37, 37)' : 'rgb(24, 120, 86)';
    if (panel.style.borderColor !== color) panel.style.borderColor = color;
  }
  async function fail(error) {
    stopped = true; aborter.abort();
    if (state) {
      state.stopped = true;
      if (state.entry) state.entry.password = '';
      try { if ((await read(STORE))?.id === state.id) await save(); } catch (_) { /* 保存できなくても操作は停止する */ }
    }
    show('停止：' + (error.message || '画面を確認してください'), true);
  }
  function wait(check, message, timeout = 25000) {
    show(message);
    return new Promise((resolve, reject) => {
      let observer, timer, poll, finished = false;
      const finish = (error, result) => {
        if (finished) return; finished = true;
        clearTimeout(timer); clearInterval(poll); observer?.disconnect();
        aborter.signal.removeEventListener('abort', cancel);
        error ? reject(error) : resolve(result);
      };
      const cancel = () => finish(Error('操作を停止しました'));
      const test = () => { try { const result = check(); if (result) finish(null, result); } catch (e) { finish(e); } };
      if (aborter.signal.aborted) return cancel();
      observer = new MutationObserver(test);
      observer.observe(document.body, {childList:true,subtree:true,attributes:true});
      poll = setInterval(test, 150);
      timer = setTimeout(() => finish(Error(message + '：時間切れ。送信は繰り返しません')), timeout);
      aborter.signal.addEventListener('abort', cancel, {once:true}); test();
    });
  }
  async function guardRun() {
    const stored = await read(STORE);
    if (stopped || !stored || stored.id !== state.id || stored.stopped || stored.expires <= Date.now()) {
      throw Error('実行データが変更・停止・期限切れになりました');
    }
  }
  async function clickOnce(key, el) {
    await guardRun();
    if (state.actions[key]) throw Error('実行済みの操作を再送しません（' + key + '）');
    if (!enabled(el)) throw Error('ボタンが有効ではありません');
    state.actions[key] = Date.now(); await save(); await guardRun();
    el.click(); // requestSubmit等を重ねて送信しない。
  }
  function setValue(el, value) {
    if (!enabled(el)) throw Error('入力欄が有効ではありません');
    if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === value && !o.disabled)) {
      throw Error('指定枚数の選択肢がありません');
    }
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    for (const type of ['input','change','blur']) el.dispatchEvent(new Event(type,{bubbles:true}));
    if (el.value !== value) throw Error('入力が反映されませんでした');
  }
  function check(el) {
    if (!el || el.disabled) throw Error('選択欄が有効ではありません');
    if (!el.checked) el.click();
    for (const type of ['input','change']) el.dispatchEvent(new Event(type,{bubbles:true}));
    if (!el.checked) throw Error('チェックが反映されませんでした');
  }
  function validGasUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && u.hostname === 'script.google.com' &&
        /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname) && !u.search && !u.hash;
    } catch (_) { return false; }
  }
  async function configuration() {
    const previous = await read(CONFIG, {});
    if (validGasUrl(previous.url) && previous.token && /^[1-4]$/.test(previous.quantity)) return previous;
    show('初回設定：GASのURL・接続キー・枚数を設定してください');
    return new Promise((resolve, reject) => {
      const form = document.createElement('form');
      const input = (name, title, type, value = '') => {
        const l = document.createElement('label'); l.textContent = title;
        const field = document.createElement('input'); field.name = name; field.type = type; field.value = value;
        field.required = true; field.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:4px 0 8px';
        l.append(field); form.append(l); return field;
      };
      const url = input('url','GASの /exec URL','url',previous.url);
      const token = input('token','接続キー HUNTER_API_TOKEN','password',previous.token);
      const quantity = input('quantity','枚数（1〜4）','number',previous.quantity);
      quantity.min = '1'; quantity.max = '4';
      const saveButton = document.createElement('button'); saveButton.type = 'submit'; saveButton.textContent = '保存して開始'; form.append(saveButton);
      form.onsubmit = async e => {
        e.preventDefault();
        if (!validGasUrl(url.value.trim()) || !token.value.trim() || !/^[1-4]$/.test(quantity.value)) {
          show('URL・接続キー・1〜4枚の指定を確認してください',true); return;
        }
        const value = {url:url.value.trim(),token:token.value.trim(),quantity:quantity.value};
        try { await write(CONFIG,value); controls.replaceChildren(); resolve(value); } catch(e) { reject(e); }
      };
      controls.replaceChildren(form);
      aborter.signal.addEventListener('abort',()=>reject(Error('初回設定を中止しました')),{once:true});
    });
  }
  async function request(body) {
    const config = await read(CONFIG, {});
    if (!validGasUrl(config.url) || !config.token) throw Error('GASの初回設定がありません');
    return new Promise((resolve,reject) => {
      const call = typeof gm?.xmlHttpRequest === 'function' ? gm.xmlHttpRequest.bind(gm)
        : typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
      if (!call) return reject(Error('GM通信APIがありません'));
      const options = {method:'POST',url:config.url,headers:{'Content-Type':'text/plain;charset=utf-8'},
        data:JSON.stringify({...body,token:config.token,sheet:'HunterHunter舞台'}),timeout:30000,
        onload:r=>{
          try {
            if (r.status !== 200) throw Error('GASのHTTPエラー：' + r.status);
            const data = JSON.parse(r.responseText);
            if (data.error) throw Error(data.error);
            if (data.siteId !== SITE || data.version !== VERSION) throw Error('今回のGASではありません');
            resolve(data);
          } catch(e) { reject(e); }
        },onerror:()=>reject(Error('GASへの接続に失敗しました')),ontimeout:()=>reject(Error('GASへの接続が時間切れです'))};
      try { const pending = call(options); if (pending?.catch) pending.catch(reject); } catch(e) { reject(e); }
    });
  }
  function validateEntry(entry, no, quantity) {
    if (!entry || entry.siteId !== SITE || entry.sourceSheet !== 'HunterHunter舞台' || String(entry.no) !== no ||
      entry.lcode !== '30041' || !entry.mailAddr || !entry.password) throw Error('GASから取得した申込データが違います');
    if (!/^2027\/\d{2}\/\d{2}$/.test(entry.dateText) || !/^\d{2}:\d{2}$/.test(entry.timeText)) throw Error('公演日時が不正です');
    const expected = entry.dateText >= '2027/01/23' && entry.dateText <= '2027/02/07' ? '36016'
      : entry.dateText >= '2027/02/13' && entry.dateText <= '2027/02/21' ? '54364' : null;
    if (!expected || entry.venueCd !== expected) throw Error('公演日と会場が一致しません');
    if (entry.pfKey && (typeof entry.pfKey !== 'string' || !/^\d{20}$/.test(entry.pfKey))) throw Error('PF_KEYは20桁の文字列が必要です');
    if (entry.seatTypeName !== '全席指定' || entry.payment !== 'store' || entry.delivery !== 'store') throw Error('席種・支払・引取の設定が今回の受付と違います');
    const qty = String(entry.quantity || quantity || '');
    if (!/^[1-4]$/.test(qty)) throw Error('枚数を1〜4枚で設定してください');
    return {...entry,quantity:qty};
  }
  function isStart(url) { return url.origin === 'https://rh06-71.github.io' && /^\/hunterhunter2026\/?$/.test(url.pathname); }
  function inTarget(url) { return url.origin === 'https://l-tike.com' && (url.pathname === new URL(BASE).pathname || url.pathname.startsWith(new URL(BASE).pathname + '/')); }
  function isContinuation(url) {
    return url.origin === 'https://l-tike.com' && (inTarget(url) || /^\/(?:pub|res)\/Tt\//i.test(url.pathname));
  }
  function samePerformance(value, entry = state.entry) {
    const s = String(value).normalize('NFKC');
    const dates = Array.from(s.matchAll(/(2027)[/年.-](\d{1,2})[/月.-](\d{1,2})/g))
      .map(m => m[1] + '/' + m[2].padStart(2,'0') + '/' + m[3].padStart(2,'0'));
    const times = Array.from(s.matchAll(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/g))
      .map(m => m[1].padStart(2,'0') + ':' + m[2]);
    return dates.length === 1 && dates[0] === entry.dateText && times.length === 1 && times[0] === entry.timeText;
  }
  function verifySelection(root) {
    if (!samePerformance(text(root))) throw Error('選択中の公演日時がGASの指定と一致しません');
    if (!norm(text(root)).includes(norm(state.entry.venueName)) || !/HUNTER×HUNTER/i.test(norm(text(root)))) {
      throw Error('選択中の会場・作品名が違います');
    }
    return true;
  }
  async function agreementPage() {
    const box = document.querySelector('#CONSENT_CHK_BOX');
    if (!box) return false;
    if (state.actions.agreement) {show('規約画面からの遷移を待っています');return true;}
    check(box);
    const form = box.form || box.closest('form') || document;
    await clickOnce('agreement',await wait(()=>action(['次へ'],form),'次へボタンの有効化を待っています'));
    return true;
  }
  async function venuePage() {
    if (state.actions.venue) {show('公演選択画面への移動を待っています');return;}
    const buttons = await wait(()=>{
      const values = all('input.ENTRY_DETAIL_BUTTON'); return values.length ? values : null;
    },'公演一覧を待っています');
    const candidates = buttons.filter(btn => {
      const row = btn.closest('tr');
      return row && norm(text(row)).includes(norm(state.entry.venueName));
    });
    const button = one(candidates,'指定会場の公演');
    if (!button) throw Error('GASで指定された会場がありません');
    await clickOnce('venue',button);
  }
  function cards() {
    return all('#pfday .ticketSalesSelectBox2').filter(el=>
      el.querySelector('input[id^="c_SEAT_TYPE_"]') ||
      el.querySelector('input[name="c_PF_KEY_HIDDEN"]') && /2027[\/年]/.test(text(el)));
  }
  async function chooseDate() {
    const listButton = all('input.c_ALST_DISP_BUTTON_FOR_CALENDAR').find(enabled);
    if (listButton && !state.actions.listView) await clickOnce('listView',listButton);
    await wait(()=>cards().length,'公演一覧の日時を待っています');
    for (let page = 0; page < 30; page++) {
      const current = cards();
      const matches = current.filter(el=>samePerformance(text(el)) && norm(text(el)).includes(norm(state.entry.venueName)));
      const target = one(matches,'指定日時の公演');
      if (target) {
        const field = target.querySelector('input[name="c_PF_KEY_HIDDEN"]');
        if (!field || !/^\d{20}$/.test(field.value)) throw Error('公演のPF_KEYを確認できません');
        if (state.entry.pfKey && state.entry.pfKey !== field.value) throw Error('公演マスタのPF_KEYと画面の日時が一致しません');
        state.selectedPfKey = field.value;
        await clickOnce('date',target.querySelector('input[id^="c_SEAT_TYPE_"]') || target); return;
      }
      const signature = current.map(text).join('|');
      const next = action(['後＞','後>','次へ＞','次へ>'],document.querySelector('#pfday') || document);
      if (!next) throw Error('指定日時の公演がありません。D列の日付と開演時刻を確認してください');
      await clickOnce('page:' + signature,next);
      await wait(()=>cards().length && cards().map(text).join('|') !== signature,'次の公演ページを待っています');
    }
    throw Error('公演一覧のページ数が上限を超えました');
  }
  async function selectPage() {
    if (state.actions.orderProceed) {show('申込画面への移動を待っています');return;}
    if (!state.actions.date) await chooseDate();
    if (!state.actions.seat) {
      const form = await wait(()=>one(all('#pfday form[id^="pfday_"],#pfday .seatSelectBtn').filter(el=>
        !/noSelectSeatType|disabled/.test(String(el.className)) &&
        norm(text(el.querySelector('span.bold') || el)).includes(norm(state.entry.seatTypeName))),'指定席種'),'全席指定の席種を待っています');
      const pf = form.querySelector('input[name="c_PF_KEY_HIDDEN"]');
      if (pf && pf.value !== state.selectedPfKey) throw Error('席種欄の公演コードが違います');
      const box = form.matches('.seatSelectBtn') ? form : form.closest('.ticketSalesSelectBox2');
      if (!box) throw Error('席種のクリック対象がありません');
      await clickOnce('seat',box);
    }
    if (!state.actions.quantity) {
      const form = await wait(()=>{
        const qty = all('select[name="c_PRT_CNT[]"],select[name="c_PRT_CNT"]');
        const el = one(qty,'枚数欄'); return el?.form || el?.closest('form');
      },'枚数の入力欄を待っています');
      verifySelection(form);
      const qty = one(all('select[name="c_PRT_CNT[]"],select[name="c_PRT_CNT"]',form),'枚数欄');
      setValue(qty,state.entry.quantity);
      const pf = form.querySelector('input[name="c_PF_KEY_HIDDEN"]');
      if (!pf || pf.value !== state.selectedPfKey) throw Error('枚数欄の公演コードが違います');
      // 今回の受付は「選択」だけでログイン画面へ進む場合がある。
      // 公演・席種・枚数を照合した記録を、画面遷移より先に保存する。
      state.ticketSelected = true;
      state.selectionProof = {pfKey:state.selectedPfKey,dateText:state.entry.dateText,
        timeText:state.entry.timeText,quantity:state.entry.quantity,venueCd:state.entry.venueCd};
      await clickOnce('quantity',await wait(()=>action(['選択','お申し込み'],form),'選択ボタンを待っています'));
    }
    const proceed = await wait(()=>action(['お申し込み','お申込み','申し込みへ進む']), '選択したチケットの反映を待っています');
    const root = document.querySelector('#hopeDisp') || document.querySelector('#addorder');
    if (!root || !verifyTicket(root)) throw Error('選択結果を確認できません');
    state.ticketSelected = true; await save();
    await clickOnce('orderProceed',proceed);
  }
  function pairs(root) {
    const values = [];
    for (const row of all('tr',root)) {
      const th = row.querySelector('th');
      if (th) values.push([norm(text(th)),Array.from(row.querySelectorAll('td')).map(text).join(' ')]);
    }
    for (const dt of all('dt',root)) {
      if (dt.nextElementSibling?.tagName === 'DD') values.push([norm(text(dt)),text(dt.nextElementSibling)]);
    }
    return values;
  }
  function verifyTicket(root) {
    const values = pairs(root);
    const dates = values.filter(([key])=>/^(?:公演日|公演日時|日時)[:：]?$/.test(key));
    if (dates.length !== 1 || !samePerformance(dates[0][1])) throw Error('確認画面の公演日時が違うか、希望が複数あります');
    const venues = values.filter(([key])=>/^会場[:：]?$/.test(key));
    if (venues.length !== 1 || !norm(venues[0][1]).includes(norm(state.entry.venueName))) throw Error('確認画面の会場が違います');
    const seats = values.filter(([key])=>/席種|券種|枚数/.test(key));
    if (!seats.some(([,value])=>norm(value).includes(norm(state.entry.seatTypeName)))) throw Error('確認画面の席種が違います');
    const quantities = seats.flatMap(([,value])=>Array.from(norm(value).matchAll(/(\d+)枚/g)).map(m=>m[1]));
    const selectValues = all('select[name*="PRT_CNT"]',root).map(el=>el.value);
    const observed = quantities.length ? quantities : selectValues;
    if (!observed.length || observed.some(n=>n !== state.entry.quantity)) throw Error('確認画面の枚数が指定と一致しません');
    if (!/HUNTER×HUNTER/i.test(norm(text(root)))) throw Error('確認画面の作品名が違います');
    return true;
  }
  async function loginPage() {
    if (state.actions.login) {show('ログイン送信済みです。認証・エラーを確認してください');return;}
    const mail = await wait(()=>one(all('#MAIL_ADDR,input[name="MAIL_ADDR"],input[name="mailAddr"],input[type="email"]'),'メール欄'),'ログイン画面を待っています');
    const password = one(all('#PWD,input[name="PWD"],input[name="password"],input[type="password"]'),'パスワード欄');
    if (!password || !state.entry.password) throw Error('ログイン情報がありません。入口から開始してください');
    setValue(mail,state.entry.mailAddr); setValue(password,state.entry.password);
    state.entry.password = ''; await save();
    const form = mail.form || mail.closest('form');
    if (!form || password.form !== form) throw Error('ログインフォームが一致しません');
    await clickOnce('login',await wait(()=>action(['ログイン'],form),'ログインボタンの有効化を待っています'));
  }
  function radioText(el) {
    return norm(Array.from(el.labels || []).map(text).join(' ') + text(el.closest('label')) + text(el.nextElementSibling));
  }
  async function paymentPage() {
    if (state.actions.payment) {show('引取・支払方法の送信結果を待っています');return;}
    for (const name of ['PAYMENT_MTHD_SEL','TAKE_OVER_MTHD_SEL']) {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(el=>el.name === name && !el.disabled);
      if (radios.length) {
        const store = one(radios.filter(el=>/店頭|ローソン.*ミニストップ/.test(radioText(el))),'店頭の支払・引取方法');
        if (!store) throw Error('店頭の支払・引取方法を選べません');
        check(store);
      }
    }
    for (const checkbox of all('input[type="checkbox"]')) if (/確認[・･]了承しました/.test(radioText(checkbox))) check(checkbox);
    const next = await wait(()=>action(['次へ','次へ進む']),'引取・支払方法の次へボタンを待っています');
    const form = next.form || next.closest('form');
    if (form?.checkValidity && !form.checkValidity()) {show('引取・支払画面の未入力項目を手動で入力してください');return;}
    await clickOnce('payment',next);
  }
  function verifyPayment(root) {
    const values = pairs(root);
    for (const [pattern,description] of [[/^支払方法[:：]?$/,'支払方法'],[/^引取方法[:：]?$/,'引取方法']]) {
      const matches = values.filter(([key])=>pattern.test(key));
      if (matches.length !== 1 || !/店頭/.test(norm(matches[0][1]))) throw Error('最終確認の' + description + 'を店頭と確認できません');
    }
  }
  async function confirmPage(button) {
    if (state.actions.finalSubmit) {show('確定を送信済みです。完了表示を待っています。自動再送はしません');return;}
    const root = document.querySelector('#mainContents') || document.querySelector('#main') || document.body;
    verifyTicket(root); verifyPayment(root);
    if (!state.ticketSelected) throw Error('今回の公演選択の記録がありません');
    const emails = pairs(root).filter(([key])=>/^メールアドレス[:：]?$/.test(key));
    if (emails.some(([,value])=>norm(value).toLowerCase() !== norm(state.entry.mailAddr).toLowerCase())) {
      throw Error('確認画面のアカウントが指定Noと違います');
    }
    if (!emails.length && !state.actions.login && !state.inheritedAccount) {
      throw Error('指定Noのアカウントでログインした記録がありません');
    }
    state.accountVerified = true;
    if (!AUTO_SUBMIT) {show('申込内容を照合しました。最後の申込確定を手動で押してください');return;}
    state.entry.password = ''; await save();
    await clickOnce('finalSubmit',button);
    show('お申込を確定しました。完了画面を待っています');
  }
  function completedHeading() {
    return all('h1,h2,h3,.hdg01,.hdg02').filter(el=>!panel?.contains(el)).some(el=>
      /^(?:お)?(?:申し込み|申込み|申込|抽選エントリー|予約)(?:手続き)?(?:が|を)?(?:完了(?:しました)?|受け付けました|受付しました)[。！!]?$/
        .test(norm(text(el))));
  }
  function requiresManualAuth(path) { return /itemauthentication|captcha|otp|telauth|phoneauth|3dsecure/i.test(path); }
  async function completedPage() {
    if (!state.actions.finalSubmit && AUTO_SUBMIT) {show('完了表示があります。今回の送信記録がないため手動で確認してください');return;}
    if (state.completed) {show('このNoの申込は完了記録があります');stopped=true;return;}
    const done = await read(DONE, {}); done[state.no] = Date.now(); await write(DONE,done);
    state.completed = true; state.entry.password = ''; await save();
    show('申込完了を確認しました');
    if (!AUTO_NEXT_SAME_ACCOUNT) {stopped=true;return;}
    const data = await request({mode:'next',no:state.no,completed:Object.keys(done)});
    if (String(data.no) !== state.no) throw Error('次の公演の応答Noが一致しません');
    if (data.nextNo == null) {show('同じアカウントの指定公演はすべて完了しました');stopped=true;return;}
    if (!/^[1-9]\d*$/.test(String(data.nextNo))) throw Error('次のNoが不正です');
    show('次の公演 No.' + data.nextNo + 'へ進みます');
    location.href = START + '#row=' + encodeURIComponent(data.nextNo);
  }
  async function route() {
    if (stopped || !state) return;
    await guardRun();
    const url = new URL(location.href);
    if (!isContinuation(url)) return;
    if (sessionStorage.getItem(BIND) !== state.id) throw Error('別タブでは自動操作しません。開始したタブで続行してください');
    if (requiresManualAuth(url.pathname)) {
      show('画像認証・本人認証は手動で操作してください。認証後に自動再開します');return;
    }
    if (completedHeading()) return completedPage();
    if (/Tt[gh]100lottakepayment\/(?:confirm|finish)/i.test(url.pathname) || action(['お申込を確定する','お申し込みを確定する','お申込みを確定する'])) {
      const button = action(['お申込を確定する','お申し込みを確定する','お申込みを確定する']);
      if (button) return confirmPage(button);
      if (state.actions.finalSubmit) {show('確定を送信済みです。画面の結果を確認してください');return;}
    }
    if (await agreementPage()) return;
    if (/020login|040reservelogin/i.test(url.pathname)) return loginPage();
    if (/050selectdayseatcount/i.test(url.pathname)) return selectPage();
    if (/100lottakepayment\/index/i.test(url.pathname)) return paymentPage();
    if (inTarget(url) && /\/sitetop\/?$/i.test(url.pathname)) return venuePage();
    show('この画面は手動確認が必要です：' + url.pathname);
  }
  function schedule() {
    if (stopped || queued || busy) return;
    queued = true;
    setTimeout(async()=>{
      queued=false; if (stopped || busy) return; busy=true;
      try {await route();} catch(e) {await fail(e);} finally {busy=false;}
    },200);
  }
  async function begin(no, retry) {
    if (!/^[1-9]\d*$/.test(no) || !Number.isSafeInteger(Number(no))) throw Error('rowはA列Noの1以上の整数を指定してください');
    const prior = await read(STORE);
    if (prior && !prior.completed && !prior.stopped && prior.expires > Date.now()) {
      throw Error('別の申込を実行中です。元のタブで完了または停止してから開始してください');
    }
    const done = await read(DONE, {});
    if (done[no] && !retry) throw Error('このNoは完了記録があります。再実行する場合だけ #row=' + no + '&retry=1 を指定してください');
    const config = await configuration();
    show('指定NoのデータをGASから取得しています');
    const entry = validateEntry(await request({mode:'entry',no}),no,config.quantity);
    if (stopped) return;
    const inheritedAccount = Boolean(prior?.completed && prior.accountVerified && prior.expires > Date.now() &&
      prior.entry?.mailAddr.toLowerCase() === entry.mailAddr.toLowerCase());
    state = {id:crypto.randomUUID(),no,siteId:SITE,entry,actions:{},expires:Date.now()+TTL,claimAllowed:true,inheritedAccount};
    await save(); await guardRun();
    location.href = OFFICIAL;
  }
  // テスト時はこの位置までの関数だけを取り出し、実サイトには送信しません。
  try {
    const url = new URL(location.href);
    if (!isStart(url) && !isContinuation(url)) return;
    if (document.getElementById('hunterhunter2026-panel')) return;
    if (isStart(url)) {
      show('開始するNoを指定してください');
      const hash = new URLSearchParams(location.hash.slice(1));
      if (hash.has('row')) return await begin(hash.get('row'),hash.get('retry') === '1');
      const row = document.createElement('input'); row.type='number'; row.min='1'; row.placeholder='A列のNo';
      const button=document.createElement('button'); button.textContent='このNoで開始'; button.type='button';
      button.onclick=()=>{location.hash='row='+encodeURIComponent(row.value);location.reload();};
      controls.append(row,button);return;
    }
    state=await read(STORE);
    if (!state || state.siteId !== SITE || state.expires <= Date.now() || state.stopped) return;
    const bound=sessionStorage.getItem(BIND);
    if (bound !== state.id) {
      const referrer=new URL(document.referrer || 'https://invalid.example');
      if (!inTarget(url) || !state.claimAllowed || ![new URL(OFFICIAL).origin,new URL(START).origin].includes(referrer.origin)) return;
      state.claimAllowed=false; sessionStorage.setItem(BIND,state.id); await save();
    }
    const observer=new MutationObserver(records=>{if(records.some(record=>!panel?.contains(record.target)))schedule();});
    observer.observe(document.body,{childList:true,subtree:true,attributes:true});
    document.addEventListener('input',schedule,true);document.addEventListener('change',schedule,true);
    const heartbeat=setInterval(()=>{if(stopped){clearInterval(heartbeat);observer.disconnect();}else schedule();},1000);
    schedule();
  } catch(e) {await fail(e);}
})();
