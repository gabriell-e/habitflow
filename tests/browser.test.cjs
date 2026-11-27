const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { setTimeout: wait } = require('node:timers/promises');

async function withBrowser(scenario, { seedFails = false } = {}) {
  const app = path.resolve('www');
  const profile = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'habitflow-test-'));
  const consoleErrors = [];
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    if (pathname === '/assets/data/habits.json' && seedFails) {
      await wait(500);
      return res.writeHead(503).end();
    }
    const file = path.resolve(app, path.extname(pathname) ? pathname.slice(1) : 'index.html');
    if (!file.startsWith(app + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    }[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  let browser;
  let socket;
  try {
    assert.ok(fs.existsSync(path.join(app, 'index.html')), 'Ejecuta npm run build primero.');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
      '--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
      '--user-data-dir=' + profile, 'about:blank',
    ], { windowsHide: true, stdio: 'ignore' });
    let startupError;
    browser.on('error', (error) => { startupError = error; });
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100 && !port && !startupError; i++) {
      try {
        port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
      } catch (error) {
        if (!['ENOENT', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      }
      if (!port) await wait(50);
    }
    if (startupError) throw new Error('Indica la ruta de Chrome con CHROME_PATH.', { cause: startupError });
    assert.ok(port, 'Chrome no publicó el puerto de DevTools.');
    const [page] = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const callbacks = new Map();
    let id = 0;
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        callbacks.get(message.id)?.(message);
        callbacks.delete(message.id);
      }
      if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((arg) => arg.description ?? arg.value));
      }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      callbacks.set(++id, (message) => message.error ? reject(Error(message.error.message)) : resolve(message.result));
      socket.send(JSON.stringify({ id, method, params }));
    });
    const run = async (expression) => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async (expression) => {
      for (let i = 0; i < 100; i++) {
        if (await run(expression)) return;
        await wait(40);
      }
      assert.fail('No se verificó ' + expression + '\n' + await run('document.body?.innerText')
        + '\n' + JSON.stringify(consoleErrors));
    };
    const click = async (element) => {
      await until(`(() => {
        const element = ${element};
        if (!element || element.disabled || (element.tagName !== 'BUTTON' && !element.classList.contains('hydrated'))) {
          return false;
        }
        const control = element.shadowRoot?.querySelector('button,a,input[type=checkbox]') ?? element;
        if (control.disabled) return false;
        control.click();
        return true;
      })()`);
    };
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const RealDate = Date;
      let time = new RealDate(sessionStorage.getItem('testClock') ?? '2026-11-25T12:00:00').getTime();
      let setAt = RealDate.now();
      window.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [time + RealDate.now() - setAt])); }
        static now() { return time + RealDate.now() - setAt; }
      };
      window.changeDay = (day) => {
        sessionStorage.setItem('testClock', day);
        time = new RealDate(day).getTime();
        setAt = RealDate.now();
        dispatchEvent(new Event('focus'));
      };
    })();` });
    await call('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
    await scenario({ call, run, click, until, restoreSource: () => { seedFails = false; } });
    assert.deepEqual(consoleErrors, []);
  } finally {
    socket?.close();
    if (browser?.pid && browser.exitCode === null) {
      const closed = new Promise((resolve) => browser.once('close', resolve));
      browser.kill();
      await closed;
    }
    server.close();
    const resolved = fs.realpathSync(profile);
    if (resolved === profile && path.basename(resolved).startsWith('habitflow-test-')) {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

const storage = "JSON.parse(localStorage.getItem('habitflow.data.v1'))";
const card = (name) => `[...document.querySelectorAll('app-today ion-card')].find(e=>e.querySelector('ion-card-title')?.textContent.trim()===${JSON.stringify(name)})`;
const button = (name, action) => `[...(${card(name)})?.querySelectorAll('ion-button')??[]].find(e=>e.textContent.trim()===${JSON.stringify(action)})`;
const hasCardText = (name, text) => `(${card(name)})?.textContent.includes(${JSON.stringify(text)})`;
const tab = (name) => `document.querySelector('ion-tab-button[tab="${name}"]')`;
const habitCard = (name) => `[...document.querySelectorAll('app-habits .habit-row')].find(e=>e.querySelector('ion-card-title')?.textContent.trim()===${JSON.stringify(name)})`;
const openHabitMenu = (click, name) => click(`(${habitCard(name)})?.querySelector('.habit-menu-trigger')`);
const menuOption = (label) => `[...document.querySelectorAll('ion-popover:not(.overlay-hidden) ion-item')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`;

test('Hoy registra, corrige y persiste las tres modalidades', async () => {
  await withBrowser(async ({ call, run, click, until }) => {
    const amount = async (name, value) => {
      await run(`(()=>{const field=(${card(name)}).querySelector('input');field.value=${JSON.stringify(value)};
        field.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));})()`);
      await click(button(name, 'Guardar'));
    };
    await until(hasCardText('Meditar', 'Pendiente'));
    await click(button('Preparar la jornada', 'Completar'));
    await until(hasCardText('Preparar la jornada', 'Completado'));
    await click(button('Preparar la jornada', 'Deshacer'));
    await until(hasCardText('Preparar la jornada', 'Sin registro'));
    await click(button('Preparar la jornada', 'Completar'));
    await amount('Meditar', '5');
    await until(hasCardText('Meditar', 'Parcial'));
    await amount('Meditar', '10');
    await until(hasCardText('Meditar', 'Completado'));
    await amount('Meditar', '-1');
    await until(hasCardText('Meditar', 'no negativo'));

    await click(button('Leer', '+1'));
    await click(button('Leer', '+1'));
    await until(hasCardText('Leer', 'Registrado: 2'));
    await amount('Leer', '15');
    await until(hasCardText('Leer', '1 de 3 días completados'));
    await amount('Leer', '6');
    await until(hasCardText('Leer', '0 de 3 días completados'));
    await amount('Leer', '9007199254740992');
    await until(hasCardText('Leer', '9007199254740992'));
    await click(button('Leer', '+1'));
    await until(hasCardText('Leer', 'demasiado grande'));
    assert.equal(await run(storage + ".records.find(record=>record.habitId==='example-reading').value"), 9007199254740992);
    await amount('Leer', '6');
    await until(hasCardText('Leer', '0 de 3 días completados'));
    assert.equal(await run(storage + '.records.length'), 3);
    assert.equal(await run(storage + ".records.every(record=>record.date==='2026-11-25')"), true);

    await run("window.sameDocument=true; window.originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')}");
    await click(button('Leer', '+1'));
    await until(hasCardText('Leer', 'No se pudieron guardar'));
    assert.equal(await run(storage + ".records.find(record=>record.habitId==='example-reading').value"), 6);
    await run('Storage.prototype.setItem=window.originalSetItem');
    await click(tab('habitos'));
    await until("location.pathname==='/tabs/habitos'");
    await click(tab('hoy'));
    await until("location.pathname==='/tabs/hoy'");
    assert.equal(await run('window.sameDocument'), true);
    await call('Page.reload');
    await until(`!window.sameDocument && typeof window.changeDay === 'function' && ${hasCardText('Leer', 'Registrado: 6')}`);
    await run("changeDay('2026-11-28T00:01:00')");
    await until(`!(${card('Preparar la jornada')}) && ${hasCardText('Meditar', 'Sin registro')}`);
    await run("changeDay('2026-11-30T00:01:00')");
    await until(hasCardText('Preparar la jornada', 'Pendiente'));
    await run("changeDay('2026-11-30T23:59:59.800')");
    await until("document.querySelector('app-today time')?.textContent.includes('diciembre')");
    await click(button('Preparar la jornada', 'Completar'));
    await until(storage + ".records.some(record=>record.date==='2026-12-01')");
    await click(tab('habitos'));
    const meditar = habitCard('Meditar');
    await click(`(${meditar})?.querySelector('ion-toggle')`);
    await until(`(${meditar})?.querySelector('ion-toggle')?.checked === false
      && ${storage}.habits.find(habit=>habit.id==='example-meditation').active === false`);
    await click(tab('hoy'));
    await until(`location.pathname==='/tabs/hoy' && !(${card('Meditar')})`);
  });
});

test('Progreso actualiza porcentajes, filtros, calendario e historial al navegar', async () => {
  await withBrowser(async ({ call, run, click, until }) => {
    const progressCard = (title) => `[...document.querySelectorAll('app-progress ion-card')].find(e=>e.querySelector('ion-card-title')?.textContent.trim()===${JSON.stringify(title)})`;
    const progressText = (title, phrase) => `(${progressCard(title)})?.textContent.includes(${JSON.stringify(phrase)})`;
    const progressButton = (label) => `[...document.querySelectorAll('app-progress ion-button')].find(button=>button.textContent.trim()===${JSON.stringify(label)})`;
    const go = async (name) => {
      await click(tab(name));
      await until(`location.pathname==='/tabs/${name}'`);
    };
    const alert = "document.querySelector('ion-alert:not(.overlay-hidden)')";
    const alertButton = async (label) => {
      const item = `[...(${alert})?.querySelectorAll('button')??[]].find(button=>button.textContent.trim()===${JSON.stringify(label)})`;
      await until(`Boolean(${item})`);
      await run(`(${item}).click()`);
    };
    const select = async (label) => {
      await click("document.querySelector('app-progress ion-select')");
      await alertButton(label);
      await alertButton('Aceptar');
      await until(`!(${alert})`);
    };

    await until(hasCardText('Meditar', 'Pendiente'));
    await go('progreso');
    await until(progressText('Historial del período', 'No hay registros'));
    await until(progressText('Resumen', 'no hay suficientes datos'));
    await run(`(() => {
      const data=${storage};
      delete data.schedule;
      data.records=[{habitId:'legacy-deleted',date:'2026-11-24',value:2,completed:true}];
      localStorage.setItem('habitflow.data.v1',JSON.stringify(data));
    })()`);
    await call('Page.reload');
    await until(progressText('Historial del período', 'Hábito eliminado'));
    await until(progressText('Historial del período', 'Sin programación conocida'));
    assert.equal(await run(storage + ".schedule.every(change=>change.date==='2026-11-25')"), true);

    await run(`(() => {
      const data=${storage};
      data.schedule=data.schedule.map(change=>({...change,date:change.habitId==='example-reading'?'2026-11-16':'2026-11-23'}));
      data.records.push(
        {habitId:'example-meditation',date:'2026-11-23',value:10,completed:true},
        ...['16','18','20','23'].map(day=>({habitId:'example-reading',date:'2026-11-'+day,value:15,completed:true}))
      );
      localStorage.setItem('habitflow.data.v1',JSON.stringify(data));
      window.oldPage=true;
    })()`);
    await call('Page.reload');
    await until(`!window.oldPage && ${progressText('Resumen', 'oportunidades evaluadas')}`);
    await select('Meditar');
    await until(progressText('Resumen', '50 %'));
    await click("document.querySelector('app-progress .calendar button:nth-of-type(2)')");
    await until(progressText('Calendario', 'Meditar · Incumplido'));
    await run('window.sameDocument = true');
    await go('hoy');
    await run(`(()=>{ const field=(${card('Meditar')}).querySelector('input');field.value='4';
      field.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true})); })()`);
    await click(button('Meditar', 'Guardar'));
    await until(hasCardText('Meditar', 'Parcial'));
    await go('progreso');
    await click("document.querySelector('app-progress .calendar button:nth-of-type(3)')");
    await until(progressText('Calendario', 'Meditar · Parcial'));
    await until(progressText('Resumen', '50 %'));
    assert.equal(await run("document.querySelector('app-progress .period-navigation p').textContent.match(/2026/g).length"), 1);
    await go('hoy');
    await run(`(()=>{ const field=(${card('Meditar')}).querySelector('input');field.value='10';
      field.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true})); })()`);
    await click(button('Meditar', 'Guardar'));
    await until(hasCardText('Meditar', 'Completado'));
    await go('progreso');
    await until(progressText('Resumen', '67 %'));
    assert.equal(await run('window.sameDocument'), true);

    await select('Leer');
    await until(progressText('Rachas y metas semanales', '1 de 3 días'));
    await until(progressText('Rachas y metas semanales', 'En curso'));
    await click("document.querySelector('app-progress ion-segment-button[value=month]')");
    await until(progressText('Resumen', '100 %'));
    await until(progressText('Rachas y metas semanales', 'Actual: 1'));
    assert.equal(await run("document.querySelectorAll('app-progress .calendar button').length"), 30);
    await run("changeDay('2026-11-30T00:01:00')");
    await until(progressText('Resumen', '67 %'));
    await until(progressText('Rachas y metas semanales', 'Meta incumplida'));
    await until(progressText('Rachas y metas semanales', 'Actual: 0'));
    await run("changeDay('2026-12-01T00:01:00')");
    await until("document.querySelectorAll('app-progress .calendar button').length === 31");
    await click(progressButton('Anterior'));
    await until(progressText('Resumen', '67 %'));
    await click(progressButton('Siguiente'));
    await until(progressText('Resumen', 'no hay suficientes datos'));

    await go('habitos');
    await openHabitMenu(click, 'Meditar');
    await click(menuOption('Eliminar'));
    await alertButton('Eliminar');
    await until(`!(${habitCard('Meditar')}) && !(${alert})`);
    await go('progreso');
    await click(progressButton('Anterior'));
    await select('Meditar · Eliminado');
    await until(progressText('Historial del período', '10 minutos · Completado'));
    assert.equal(await run(storage + ".records.some(record=>record.habitId==='example-meditation')"), true);
    assert.equal(await run('window.sameDocument'), true);
  });
});

test('Hoy y Progreso muestran carga, recuperan un error de origen y respetan una colección vacía', async () => {
  await withBrowser(async ({ call, run, click, until, restoreSource }) => {
    await until("!!document.querySelector('app-today ion-spinner')");
    await until("document.querySelector('app-today [role=alert]')?.textContent.includes('iniciales')");
    await click(tab('progreso'));
    await until("!!document.querySelector('app-progress ion-spinner')");
    await until("document.querySelector('app-progress [role=alert]')?.textContent.includes('iniciales')");
    assert.equal(await run(storage), null);
    restoreSource();
    await click("document.querySelector('app-progress .surface-error ion-button')");
    await until("document.querySelector('app-progress')?.textContent.includes('No hay registros')");
    await click(tab('hoy'));
    await until(hasCardText('Meditar', 'Pendiente'));
    assert.equal(await run(storage + '.habits.length'), 3);
    await run("localStorage.setItem('habitflow.data.v1',JSON.stringify({habits:[],records:[],schedule:[]}))");
    await call('Page.reload');
    for (const scheme of ['light', 'dark']) {
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      if (await run("location.pathname !== '/tabs/hoy'")) await click(tab('hoy'));
      await until("document.querySelector('app-today')?.textContent.includes('No tienes hábitos')");
      await click(tab('habitos'));
      await until("document.querySelector('app-habits')?.textContent.includes('Aún no tienes hábitos')");
      await click(tab('progreso'));
      await until("document.querySelector('app-progress')?.textContent.includes('No hay registros en este período')");
      assert.equal(await run(storage + '.habits.length'), 0);
    }
  }, { seedFails: true });
});

test('el almacenamiento corrupto se conserva y Reintentar recupera una copia válida', async () => {
  await withBrowser(async ({ call, run, click, until }) => {
    const key = 'habitflow.data.v1';
    const raw = `localStorage.getItem('${key}')`;
    const put = (value) => run(`localStorage.setItem('${key}', ${JSON.stringify(value)})`);
    const message = "document.querySelector('app-today .surface-error [role=alert]')?.textContent";
    const retry = "document.querySelector('app-today .surface-error ion-button')";
    await until(hasCardText('Meditar', 'Pendiente'));
    const valid = await run(raw);
    await put('{');
    await call('Page.reload');
    await until(`(${message})?.includes('JSON válido')`);
    assert.equal(await run(raw), '{');

    const data = JSON.parse(valid);
    for (const invalid of [
      { ...data, records: [{ habitId: 'example-planning', date: '2026-11-25', value: false, completed: true }] },
      { ...data, records: [{ habitId: 'example-reading', date: '2026-11-25', value: 2, completed: true,
        goal: { unit: 'páginas', target: 15 } }] },
      { ...data, schedule: [{ habitId: 'example-reading', date: '0000-01-01', frequency: { kind: 'weekly', times: 2 } }] },
    ]) {
      const damaged = JSON.stringify(invalid);
      await put(damaged);
      await click(retry);
      await until(`(${message})?.includes('formato inválido')`);
      assert.equal(await run(raw), damaged);
    }
    await put(valid);
    await click(retry);
    await until(hasCardText('Meditar', 'Pendiente'));
    assert.equal(await run(raw), valid);
  });
});

function contrast(first, second) {
  const luminance = (color) => {
    const hex = color.trim().slice(1);
    const channels = hex.length === 3 ? hex.split('').map((digit) => digit + digit) : hex.match(/../g);
    const [red, green, blue] = channels.map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('el diseño se adapta a cuatro anchos y a los temas claro y oscuro', async () => {
  await withBrowser(async ({ call, run, click, until }) => {
    const pages = { hoy: 'today', habitos: 'habits', progreso: 'progress' };
    const go = async (name) => {
      if (await run('location.pathname') !== '/tabs/' + name) await click(tab(name));
      await until(`location.pathname === '/tabs/${name}' && !!document.querySelector('app-${pages[name]}:not(.ion-page-hidden):not(.ion-page-invisible) .page-shell h1')`);
    };
    const viewport = async (width, height) => {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
      await until(`window.innerWidth === ${width} && window.innerHeight === ${height}`);
    };
    const theme = async (scheme) => {
      await call('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await until(`matchMedia('(prefers-color-scheme: ${scheme})').matches`);
      await until(`document.documentElement.classList.contains('ion-palette-dark') === ${scheme === 'dark'}`);
    };
    const overflow = async (content) => {
      const scroll = `document.querySelector(${JSON.stringify(content)})?.shadowRoot?.querySelector('.inner-scroll')`;
      await until(`(${scroll})?.clientWidth > 0`);
      return run(`(${scroll}).scrollWidth > (${scroll}).clientWidth + 1`);
    };
    const modal = "document.querySelector('ion-modal:not(.overlay-hidden)')";
    const form = "document.querySelector('app-habit-form')";
    const modalButton = (label) => `[...(${modal})?.querySelectorAll('ion-button')??[]].find(e=>e.textContent.trim()===${JSON.stringify(label)})`;
    const create = "[...document.querySelectorAll('app-habits .page-heading ion-button')].find(e=>e.textContent.trim()==='Nuevo hábito')";
    const fill = async (control, value) => {
      const field = `(${form})?.querySelector('[formcontrolname=${control}] input')`;
      await until(`Boolean(${field})`);
      await run(`(() => {
        const field=${field};
        field.value=${JSON.stringify(value)};
        field.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));
      })()`);
    };
    const select = async (control, label) => {
      await click(`(${form})?.querySelector('ion-select[formcontrolname=${control}]')`);
      const alert = "document.querySelector('ion-alert:not(.overlay-hidden)')";
      for (const text of [label, 'Aceptar']) {
        await click(`[...(${alert})?.querySelectorAll('button')??[]].find(e=>e.textContent.trim()===${JSON.stringify(text)})`);
      }
      await until(`!(${alert})`);
    };
    const key = async (value, code, virtual) => {
      const options = { key: value, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual };
      const text = value === 'Enter' ? '\r' : undefined;
      await call('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...options, text });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', ...options });
    };

    await until(hasCardText('Meditar', 'Pendiente'));
    await run(`(() => {
      const data=${storage};
      const icons=['leaf-outline','book-outline','checkmark-circle-outline'];
      const colors=['success','tertiary','primary'];
      data.habits=data.habits.map((habit,i)=>({...habit,icon:icons[i],color:colors[i]}));
      data.habits.push({id:'example-water',name:'Tomar agua',type:'quantity',target:6,unit:'vasos',
        active:false,frequency:{kind:'daily'},icon:'water-outline',color:'secondary'});
      data.schedule=data.habits.map(habit=>({habitId:habit.id,date:'2026-11-16',frequency:habit.active?habit.frequency:null}));
      const activity=(habitId,date,value,completed)=> {
        const habit=data.habits.find(item=>item.id===habitId);
        return {habitId,date,value,completed,habitName:habit.name,
          ...(habit.type==='boolean'?{}:{goal:{target:habit.target,unit:habit.unit}})};
      };
      data.records=[
        activity('example-meditation','2026-11-23',10,true), activity('example-meditation','2026-11-24',10,true),
        activity('example-meditation','2026-11-25',7,false), activity('example-reading','2026-11-23',15,true),
        activity('example-reading','2026-11-25',15,true), activity('example-planning','2026-11-23',true,true),
      ];
      localStorage.setItem('habitflow.data.v1',JSON.stringify(data));
    })()`);
    await call('Page.reload');
    await until(hasCardText('Meditar', 'Parcial'));

    for (const scheme of ['light', 'dark']) {
      await theme(scheme);
      const colors = await run(`(() => {
        const css=getComputedStyle(document.documentElement);
        const names=['--ion-background-color','--ion-text-color','--hf-surface','--hf-muted','--ion-color-primary',
          '--ion-color-primary-contrast','--hf-control','--hf-progress-fill','--hf-soft','--hf-progress','--hf-hero-track',
          '--ion-color-success','--ion-color-warning','--ion-color-danger','--hf-warm','--hf-error-surface',
          '--hf-border','--hf-input','--hf-selection'];
        return Object.fromEntries(names.map(name=>[name,css.getPropertyValue(name).trim()]));
      })()`);
      const dark = scheme === 'dark';
      assert.equal(colors['--ion-background-color'], dark ? '#141716' : '#f5f7f5');
      assert.equal(colors['--hf-surface'], dark ? '#202422' : '#fff');
      assert.equal(colors['--hf-border'], dark ? '#343b36' : '#e0e5e1');
      assert.equal(colors['--ion-text-color'], dark ? '#e8ece9' : '#242925');
      assert.equal(colors['--ion-color-primary'], dark ? '#a8cfb1' : '#244c3b');
      for (const [first, second, minimum] of [
        ['--ion-text-color', '--ion-background-color', 4.5], ['--hf-muted', '--hf-surface', 4.5],
        ['--hf-muted', '--ion-background-color', 4.5], ['--ion-color-primary-contrast', '--ion-color-primary', 4.5],
        ['--hf-control', '--hf-surface', 3], ['--hf-control', '--hf-input', 3],
        ['--hf-progress-fill', '--hf-soft', 3],
        ['--hf-progress', '--hf-hero-track', 3],
        ['--ion-color-success', '--hf-selection', 4.5], ['--ion-color-warning', '--hf-warm', 4.5],
        ['--ion-color-primary', '--hf-selection', 4.5],
        ['--ion-color-danger', '--hf-error-surface', 4.5],
      ]) {
        assert.ok(contrast(colors[first], colors[second]) >= minimum, `${scheme}: ${first} / ${second}`);
      }

      for (const width of [360, 390, 768, 1366]) {
        await viewport(width, width === 1366 ? 1150 : 844);
        for (const [name, page] of Object.entries(pages)) {
          await go(name);
          await until(`(${tab(name)})?.classList.contains('tab-selected') === true`);
          assert.equal(await overflow(`app-${page} > ion-content`), false, `${name} ${scheme} ${width}px`);
          assert.equal(await run("document.querySelectorAll('ion-tab-button').length"), 3);
          const touches = await run("Array.from(document.querySelectorAll('ion-tab-button'),e=>e.getBoundingClientRect().height)");
          assert.ok(touches.every((height) => height >= 44));
          if (name === 'progreso') {
            assert.ok(await run(`(() => {
              const {width, height} = document.querySelector('app-progress .calendar button').getBoundingClientRect();
              return width >= 24 && height >= 44;
            })()`));
          }
          if (process.env.HABITFLOW_SCREENSHOTS === '1' && (width === 390 || (width === 1366 && name === 'progreso'))) {
            if (width === 390 && name === 'hoy') await viewport(390, 1000);
            await until(`Array.from(document.querySelectorAll('app-${page} ion-icon')).every(e=>e.classList.contains('hydrated'))`);
            const screenshot = await call('Page.captureScreenshot', { format: 'png' });
            const folder = path.resolve('docs/screenshots');
            fs.mkdirSync(folder, { recursive: true });
            fs.writeFileSync(path.join(folder, `${name}-${scheme === 'light' ? 'claro' : 'oscuro'}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
            if (width === 390 && name === 'hoy') await viewport(390, 844);
          }
        }

        await go('habitos');
        await until(`(() => {
          const host = ${create};
          const control = host?.shadowRoot?.querySelector('button');
          if (!control || control.disabled) return false;
          control.focus();
          return host.shadowRoot.activeElement === control;
        })()`);
        await key('Enter', 'Enter', 13);
        await until(`Boolean(${form}?.querySelector('input'))`);
        assert.equal(await overflow('ion-modal:not(.overlay-hidden) ion-content'), false, `formulario ${scheme} ${width}px`);
        await run(`(${form}).querySelector('[formcontrolname=name] input').focus()`);
        await key('Tab', 'Tab', 9);
        await until("document.activeElement?.matches('textarea') === true");
        assert.equal(await run(`getComputedStyle((${form}).querySelector('ion-textarea')).outlineStyle`), 'solid');
        if (width === 360) {
          await click(modalButton('Guardar'));
          await until(`(${form})?.querySelector('[role=alert]')?.textContent.includes('Escribe un nombre')`);
        }
        if (process.env.HABITFLOW_SCREENSHOTS === '1' && width === 390) {
          await run('document.activeElement.blur()');
          const screenshot = await call('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.resolve(`docs/screenshots/formulario-${scheme === 'light' ? 'claro' : 'oscuro'}-390.png`),
            Buffer.from(screenshot.data, 'base64'));
        }
        await click(modalButton('Cancelar'));
        await until(`!(${modal})`);
      }
    }

    await viewport(360, 844);
    await go('habitos');
    await click(create);
    await fill('name', 'Estirar');
    await select('type', 'Duración');
    await fill('target', '0');
    await click(modalButton('Guardar'));
    await until(`(${form})?.querySelector('[role=alert]')?.textContent.includes('mayor que cero')`);
    await fill('target', '5');
    await fill('unit', 'minutos');
    await select('frequency', 'Días específicos');
    const days = `(${form})?.querySelector('[formcontrolname=days]')`;
    await until(`Boolean(${days})`);
    assert.deepEqual(await run(`Array.from((${days}).querySelectorAll('ion-select-option'), option => option.textContent.trim())`),
      ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    await click(modalButton('Guardar'));
    await until(`(${form})?.querySelector('[role=alert]')?.textContent.includes('al menos un día')`);
    await select('frequency', 'Veces por semana');
    await select('times', '2');
    await click(modalButton('Guardar'));
    await until(`Boolean(${habitCard('Estirar')}) && !(${modal})`);
    assert.deepEqual(await run(storage + ".habits.find(habit=>habit.name==='Estirar').frequency"), { kind: 'weekly', times: 2 });
    await click("document.querySelector('app-habits ion-segment-button[value=active]')");
    await until(`!(${habitCard('Tomar agua')}) && Boolean(${habitCard('Meditar')})`);
    await click("document.querySelector('app-habits ion-segment-button[value=inactive]')");
    await until(`Boolean(${habitCard('Tomar agua')}) && !(${habitCard('Meditar')})`);
    await click(`(${habitCard('Tomar agua')})?.querySelector('ion-toggle')`);
    await until("document.querySelector('app-habits .state-card')?.textContent.includes('No hay hábitos inactivos')");
    await click("document.querySelector('app-habits .state-card ion-button')");
    await until(`(${habitCard('Tomar agua')})?.querySelector('ion-toggle')?.checked === true`);
    const trigger = `(${habitCard('Tomar agua')}).querySelector('.habit-menu-trigger')`;
    await run(`(${trigger}).shadowRoot.querySelector('button').focus()`);
    await key('Enter', 'Enter', 13);
    await until(`(${menuOption('Editar')})?.classList.contains('hydrated')`);
    await run(`(${menuOption('Editar')}).shadowRoot.querySelector('button').focus()`);
    await key('Enter', 'Enter', 13);
    await until(`(${form})?.querySelector('[formcontrolname=name] input')?.value === 'Tomar agua'`);
    const longName = 'HábitoDePrueba'.repeat(12);
    await fill('name', longName);
    await click(modalButton('Guardar'));
    await until(`Boolean(${habitCard(longName)}) && !(${modal})`);
    assert.equal(await overflow('app-habits > ion-content'), false);
    await go('hoy');
    await until(hasCardText(longName, 'Pendiente'));
    assert.equal(await overflow('app-today > ion-content'), false);
    await run(`(() => {
      const field=(${card('Meditar')}).querySelector('input');
      field.focus();
      field.value='8';
      field.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));
    })()`);
    await key('Enter', 'Enter', 13);
    await until(hasCardText('Meditar', 'Registrado: 8'));

    await go('habitos');
    await run("window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')}");
    await click(`(${habitCard(longName)})?.querySelector('ion-toggle')`);
    await until("document.querySelector('app-habits [role=alert]')?.textContent.includes('guardar')");
    assert.equal(await run(`(${habitCard(longName)}).querySelector('ion-toggle').checked`), true);
    await run('Storage.prototype.setItem=window.savedSetItem');
    await run(`(${tab('progreso')}).shadowRoot.querySelector('a').focus()`);
    await key('Enter', 'Enter', 13);
    await until("location.pathname === '/tabs/progreso'");
    assert.equal(await overflow('app-progress > ion-content'), false);

    await go('habitos');
    await openHabitMenu(click, 'Meditar');
    await click(menuOption('Editar'));
    await until(`(${form})?.querySelector('[formcontrolname=target] input')?.value === '10'`);
    await fill('target', '5');
    await click(modalButton('Guardar'));
    await until(`!(${modal}) && (${habitCard('Meditar')})?.textContent.includes('5 minutos')`);
    await go('hoy');
    await until(hasCardText('Meditar', 'Objetivo del registro: 10 minutos'));
    assert.equal(await run(hasCardText('Meditar', 'Parcial')), true);
    assert.equal(await run(storage + ".records.find(record=>record.habitId==='example-meditation' && record.date==='2026-11-25').completed"), false);
  });
});

test('120 hábitos con nombres largos permiten abrir, filtrar y recorrer Progreso', async (t) => {
  await withBrowser(async ({ call, run, click, until }) => {
    await until(hasCardText('Meditar', 'Pendiente'));
    await run(`(() => {
      const habits = Array.from({ length: 120 }, (_, i) => ({
        id: 'bulk-' + i, name: 'HábitoLargo'.repeat(15) + i, active: true, type: 'boolean',
        frequency: { kind: 'daily' },
      }));
      const schedule = habits.map(({id, frequency}) => ({habitId: id, date: '2025-11-26', frequency}));
      const records = habits.flatMap(({id}) => Array.from({ length: 25 }, (_, day) => ({
        habitId: id, date: '2026-11-' + String(day + 1).padStart(2, '0'), value: true, completed: true,
      })));
      localStorage.setItem('habitflow.data.v1', JSON.stringify({ habits, schedule, records }));
    })()`);
    await call('Page.reload');
    await until("document.querySelectorAll('app-today .daily-habit').length === 120");
    await click(tab('habitos'));
    await until("document.querySelectorAll('app-habits .habit-row').length === 120");
    const started = performance.now();
    await click(tab('progreso'));
    await until("document.querySelectorAll('app-progress .streak-item').length === 120");
    t.diagnostic(`Progreso semanal visible en ${Math.round(performance.now() - started)} ms (Chrome headless)`);
    await click("document.querySelector('app-progress ion-segment-button[value=month]')");
    await until("document.querySelectorAll('app-progress .history-row').length === 3000");
    await click("document.querySelector('app-progress ion-select')");
    await click("document.querySelector('ion-alert:not(.overlay-hidden) button.alert-radio-button:nth-of-type(2)')");
    await click("[...document.querySelectorAll('ion-alert:not(.overlay-hidden) button')].find(b => b.textContent.trim() === 'Aceptar')");
    await until("document.querySelectorAll('app-progress .history-row').length === 25");
    assert.equal(await run("document.querySelectorAll('app-progress .streak-item').length"), 1);
  });
});

test('la apariencia manual se conserva entre pestañas y recargas y Sistema sigue al equipo', async () => {
  await withBrowser(async ({ call, run, click, until }) => {
    const applySystem = (scheme) => call('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }],
    });
    const palette = "document.documentElement.classList.contains('ion-palette-dark')";
    const key = 'habitflow.appearance.v1';
    const saved = `JSON.parse(localStorage.getItem('${key}'))`;
    const popover = "document.querySelector('ion-popover.appearance-popover:not(.overlay-hidden)')";
    const trigger = "document.querySelector('.ion-page:not(.ion-page-hidden):not(.ion-page-invisible) .appearance-trigger')";
    const open = () => click(trigger);
    const close = async () => {
      await run(`(${popover}).dismiss()`);
      await until(`!(${popover})`);
    };
    const choose = async (preference) => {
      await open();
      await click(`(${popover})?.querySelector('ion-radio[value=${preference}]')`);
    };
    await until(hasCardText('Meditar', 'Pendiente'));
    const recordsBefore = await run(storage);
    await applySystem('dark');
    await until(palette);
    await choose('light');
    await until(`${saved} === 'light' && !${palette}`);
    await close();
    await click(tab('habitos'));
    await until("location.pathname === '/tabs/habitos'");
    await open();
    await until(`(${popover})?.querySelector('ion-radio-group')?.value === 'light'`);
    await close();
    await run('window.beforeReload = true');
    await call('Page.reload');
    await until(`!window.beforeReload && Boolean(${trigger})`);
    assert.equal(await run(saved), 'light');
    assert.equal(await run(palette), false);
    await open();
    await until(`(${popover})?.querySelector('ion-radio-group')?.value === 'light'`);
    await close();

    await applySystem('light');
    await choose('dark');
    await until(`${saved} === 'dark' && ${palette}`);
    await close();
    await choose('system');
    await until(`${saved} === 'system' && !${palette}`);
    await close();
    await applySystem('dark');
    await until(palette);

    await run(`window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(name,...args){
      if(name==='${key}')throw new DOMException('quota','QuotaExceededError');
      return window.savedSetItem.call(this,name,...args);
    }`);
    await choose('light');
    await until(`!(${palette}) && Boolean((${popover})?.querySelector('[role=status]'))`);
    assert.equal(await run(saved), 'system');
    await run('Storage.prototype.setItem=window.savedSetItem');
    await close();
    assert.deepEqual(await run(storage), recordsBefore);
  });
});
