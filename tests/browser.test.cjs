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
    for (let i = 0; i < 100 && !fs.existsSync(portFile) && !startupError; i++) await wait(50);
    if (startupError) throw new Error('Indica la ruta de Chrome con CHROME_PATH.', { cause: startupError });
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
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
        const control = element.shadowRoot?.querySelector('button,a') ?? element;
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
    await until("document.querySelector('app-today ion-card-subtitle')?.textContent.includes('diciembre')");
    await click(button('Preparar la jornada', 'Completar'));
    await until(storage + ".records.some(record=>record.date==='2026-12-01')");
    await click(tab('habitos'));
    const meditar = "[...document.querySelectorAll('app-habits ion-card')].find(card=>card.querySelector('ion-card-title')?.textContent.trim()==='Meditar')";
    await click(`[...(${meditar})?.querySelectorAll('ion-button')??[]].find(item=>item.textContent.trim()==='Desactivar')`);
    await until(`(${meditar})?.textContent.includes('Inactivo')`);
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
    const habitCard = "[...document.querySelectorAll('app-habits ion-card')].find(e=>e.querySelector('ion-card-title')?.textContent.trim()==='Meditar')";
    const remove = `[...(${habitCard})?.querySelectorAll('ion-button')??[]].find(e=>e.textContent.trim()==='Eliminar')`;
    await click(remove);
    await alertButton('Eliminar');
    await until(`!(${habitCard}) && !(${alert})`);
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
    await click("document.querySelector('app-progress ion-button')");
    await until("document.querySelector('app-progress')?.textContent.includes('No hay registros')");
    await click(tab('hoy'));
    await until(hasCardText('Meditar', 'Pendiente'));
    assert.equal(await run(storage + '.habits.length'), 3);
    await run("localStorage.setItem('habitflow.data.v1',JSON.stringify({habits:[],records:[],schedule:[]}))");
    await call('Page.reload');
    await until("document.querySelector('app-today')?.textContent.includes('No tienes hábitos')");
    assert.equal(await run(storage + '.habits.length'), 0);
  }, { seedFails: true });
});
