(()=>{'use strict';
  const app=document.getElementById('app'),logoutButton=document.getElementById('logout'),toastBox=document.getElementById('toast');
  const API='https://drxhccirijpaohsgltlm.supabase.co/functions/v1/bop-master-lift/api',FLOORS=[-1,0,1,2,3,4,5];
  let session=readSession(),pollTimer=0,adminTab='overview',knownCalls=null,qrLoader=null,audioContext=null,soundReady=false,operatorLoading=false,bossLoading=false,adminLoading=false;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const time=value=>value?new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(value)):'—';
  const statusLabel={waiting:'Ожидает',going:'ЕДУ',done:'Готово',cancelled:'Отменён'};
  function readSession(){try{return JSON.parse(sessionStorage.getItem('bop_lift_session')||'null')}catch{return null}}
  function saveSession(value){session=value;if(value)sessionStorage.setItem('bop_lift_session',JSON.stringify(value));else sessionStorage.removeItem('bop_lift_session')}
  function stopPoll(){clearInterval(pollTimer);pollTimer=0}
  function toast(message){toastBox.textContent=message;toastBox.classList.add('show');clearTimeout(toastBox._timer);toastBox._timer=setTimeout(()=>toastBox.classList.remove('show'),2200)}
  async function api(action,data={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...data}),signal:controller.signal,cache:'no-store',credentials:'omit'});
      const json=await response.json().catch(()=>({error:'bad_response'}));
      if(!response.ok){
        const error=new Error(json.error||'request_failed');error.status=response.status;
        if(session&&response.status===401){saveSession(null);renderLogin('Ключ больше не действует. Войдите снова.')}throw error;
      }
      return json.data;
    }finally{clearTimeout(timeout)}
  }
  async function copy(text){try{await navigator.clipboard.writeText(String(text));toast('Скопировано')}catch{const area=document.createElement('textarea');area.value=String(text);document.body.append(area);area.select();document.execCommand('copy');area.remove();toast('Скопировано')}}
  function presence(available){return`<span class="presence ${available?'':'off'}"><span class="dot"></span>${available?'Лифтёр на месте':'Лифтёра нет на месте'}</span>`}
  function queueHtml(queue=[],compact=false){if(!queue.length)return'<p class="muted">Очередь пуста</p>';return`<div class="queue">${queue.map((item,index)=>`<div class="queue-item ${item.status==='going'?'going':''}"><div class="queue-floor">${esc(item.floor)}</div><div><strong>${index===0?'Следующий':'В очереди'}</strong><br><span class="badge ${item.source==='boss'?'boss':''}">${item.source==='boss'?'BOSS'+(item.source_name?' · '+esc(item.source_name):''):'РАБОЧИЙ'}</span> ${item.status==='going'?'<span class="badge going">ЕДУ</span>':''}</div><div class="eta">≈ ${Math.ceil((item.eta_seconds||0)/5)*5} сек</div></div>`).join('')}</div>`}
  function floorButtons(current,disabled=false){return`<div class="floor-buttons">${FLOORS.map(f=>`<button class="floor-button ${Number(current)===f?'current':''}" data-floor="${f}" ${disabled?'disabled':''}>${f}</button>`).join('')}</div>`}
  function renderLogin(message=''){
    stopPoll();logoutButton.classList.add('hidden');
    app.innerHTML=`<section class="login-wrap"><form id="login-form" class="login-card"><h1>Вход по ключу</h1><p class="muted">Введите выданный ключ доступа.</p><label for="access-key">Ключ доступа</label><input id="access-key" class="input" type="password" inputmode="text" autocomplete="current-password" required maxlength="128"><button class="button full" type="submit">Войти</button><p id="login-error" class="error-line">${esc(message)}</p></form></section>`;
    document.getElementById('login-form').addEventListener('submit',async event=>{
      event.preventDefault();const key=document.getElementById('access-key').value.trim(),button=event.currentTarget.querySelector('button'),error=document.getElementById('login-error');
      if(!key)return;primeSound();button.disabled=true;error.textContent='Проверяем ключ…';
      try{const result=await api('login',{key});if(!result?.valid){error.textContent='Неверный ключ доступа';return}saveSession({key,access:result.access,name:result.name||''});start()}catch(e){error.textContent=e.status===429?'Слишком много попыток. Повторите через 10 минут.':'Нет связи. Попробуйте ещё раз.'}finally{button.disabled=false}
    });
    document.getElementById('access-key').focus();
  }
  function screenHead(title,sub,available){return`<div class="screen-head"><div><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></div>${presence(available)}</div>`}
  async function renderOperator(silent=false){
    if(operatorLoading)return;operatorLoading=true;
    try{
      const data=await api('operator_dashboard',{accessKey:session.key}),queue=data.queue||[],next=queue[0]||null,currentIds=new Set(queue.map(x=>String(x.id)));
      const hasNew=knownCalls===null?queue.length>0:[...currentIds].some(id=>!knownCalls.has(id));knownCalls=currentIds;
      if(hasNew){beep();try{navigator.vibrate?.([250,100,250])}catch{}}
      app.innerHTML=`${screenHead('Панель лифтёра','Новые вызовы появляются автоматически',data.available)}<div class="grid"><section class="card span5 hazard call-alert ${next?'active':''}"><div class="next-floor"><div><div class="metric-label">${next?.status==='going'?'ЛИФТ ЕДЕТ НА ЭТАЖ':'НОВЫЙ ВЫЗОВ · ЭТАЖ'}</div><div class="floor-now">${next?esc(next.floor):'—'}</div></div><div class="eta">${next?'ETA ≈ '+esc(next.eta_seconds)+' сек':'Вызовов нет'}</div></div><div class="actions" style="margin-top:18px"><button id="going" class="button big" ${!next||next.status==='going'?'disabled':''}>🚧 ЕДУ</button><button id="done" class="button green big" ${!next||next.status!=='going'?'disabled':''}>✅ ГОТОВО</button></div></section><section class="card span7 current-position"><div class="metric-label">Я СЕЙЧАС НА ЭТАЖЕ</div><div class="floor-now current-floor-value">${esc(data.current_floor)}</div>${floorButtons(data.current_floor)}<div class="actions operator-tools"><button id="availability" class="button ${data.available?'secondary':'green'}">${data.available?'⚫ НЕТ НА МЕСТЕ':'🟢 НА МЕСТЕ'}</button><button id="sound-toggle" class="button sound ${soundReady?'green':'secondary'}">${soundReady?'🔊 ЗВУК ВКЛЮЧЁН':'🔇 ВКЛЮЧИТЬ ЗВУК'}</button></div></section><section class="card span12"><h2>Очередь</h2>${queueHtml(queue)}</section></div>`;
      document.getElementById('availability').onclick=async()=>{await act('operator_available',{accessKey:session.key,available:!data.available});renderOperator()};
      document.getElementById('sound-toggle').onclick=async()=>{await primeSound();beep();toast(soundReady?'Звук уведомлений включён':'Звук заблокирован настройками телефона');const button=document.getElementById('sound-toggle');if(button){button.textContent=soundReady?'🔊 ЗВУК ВКЛЮЧЁН':'🔇 ВКЛЮЧИТЬ ЗВУК';button.className='button sound '+(soundReady?'green':'secondary')}};
      document.querySelectorAll('[data-floor]').forEach(button=>button.onclick=async()=>{const floor=Number(button.dataset.floor);await act('operator_floor',{accessKey:session.key,floor},'Текущий этаж: '+floor);renderOperator()});
      document.getElementById('going').onclick=async()=>{if(next){await act('operator_going',{accessKey:session.key,callId:next.id});renderOperator()}};
      document.getElementById('done').onclick=async()=>{if(next){await act('operator_done',{accessKey:session.key,callId:next.id});renderOperator()}};
    }catch(e){if(e.status!==401&&!silent)toast('Не удалось обновить данные')}finally{operatorLoading=false}
  }
  async function primeSound(){try{if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state!=='running')await audioContext.resume?.();soundReady=audioContext.state==='running'}catch{soundReady=false}}
  function beep(){try{if(!audioContext||audioContext.state!=='running')return;const now=audioContext.currentTime;[0,.24,.48].forEach((delay,index)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.value=index===1?1040:880;gain.gain.setValueAtTime(.18,now+delay);gain.gain.exponentialRampToValueAtTime(.001,now+delay+.18);osc.connect(gain);gain.connect(audioContext.destination);osc.start(now+delay);osc.stop(now+delay+.19)})}catch{}}
  async function renderBoss(silent=false){
    if(bossLoading)return;bossLoading=true;
    try{
      const data=await api('boss_dashboard',{accessKey:session.key});
      app.innerHTML=`${screenHead(data.name||'BOSS','Удалённый вызов лифта',data.available)}<div class="grid"><section class="card span4"><div class="metric-label">Текущий этаж лифта</div><div class="floor-now">${esc(data.current_floor)}</div></section><section class="card span8"><h2>Вызвать на этаж</h2>${floorButtons(data.current_floor,!data.available)}${!data.available?'<p class="error-line">Лифтёр сейчас не на месте</p>':''}</section><section class="card span7"><h2>Очередь</h2>${queueHtml(data.queue||[])}</section><section class="card span5"><h2>Ключ лифтёра</h2><div class="key-row"><div class="key-field">${esc(data.operator_key)}</div><button id="copy-operator" class="ghost">Копировать</button></div><button id="rotate-operator" class="button danger full">Создать новый ключ лифтёра</button><p class="muted" style="margin:10px 0 0">Старый ключ и открытая сессия сразу перестанут работать.</p></section></div>`;
      document.querySelectorAll('[data-floor]').forEach(button=>button.onclick=async()=>{await act('boss_call',{accessKey:session.key,floor:Number(button.dataset.floor)},'Вызов отправлен');renderBoss()});
      document.getElementById('copy-operator').onclick=()=>copy(data.operator_key);
      document.getElementById('rotate-operator').onclick=async()=>{if(confirm('Создать новый ключ? Старый ключ лифтёра сразу отключится.')){const key=await api('boss_rotate_operator',{accessKey:session.key});await copy(key);renderBoss()}};
    }catch(e){if(e.status!==401&&!silent)toast('Не удалось обновить данные')}finally{bossLoading=false}
  }
  function adminTabs(){return`<div class="tabs no-print">${[['overview','Обзор'],['accounts','Аккаунты'],['qr','QR-коды'],['history','История']].map(([id,label])=>`<button class="tab ${adminTab===id?'active':''}" data-tab="${id}">${label}</button>`).join('')}</div>`}
  async function renderAdmin(silent=false){
    if(adminLoading)return;adminLoading=true;
    try{
      const dashboard=await api('admin_dashboard',{accessKey:session.key});let body='';
      if(adminTab==='overview')body=`<div class="grid"><section class="card span3"><div class="metric-label">Вызовов сегодня</div><div class="metric">${dashboard.today}</div></section><section class="card span3"><div class="metric-label">Выполнено</div><div class="metric">${dashboard.done}</div></section><section class="card span3"><div class="metric-label">Активных</div><div class="metric">${dashboard.active}</div></section><section class="card span3"><div class="metric-label">Этаж лифта</div><div class="metric">${dashboard.current_floor}</div></section><section class="card span7"><h2>Активная очередь</h2>${queueHtml(dashboard.queue||[])}</section><section class="card span5"><h2>Ключ лифтёра</h2><div class="key-row"><div class="key-field">${esc(dashboard.operator_key)}</div><button id="copy-operator" class="ghost">Копировать</button></div><button id="rotate-operator" class="button danger full">Создать новый ключ лифтёра</button></section><section class="card span12"><h2>Вызовы по этажам сегодня</h2><div class="floor-buttons">${FLOORS.map(f=>`<div class="floor-button" style="display:grid;place-items:center">${f}<small>× ${dashboard.floors?.[f]||0}</small></div>`).join('')}</div></section></div>`;
      if(adminTab==='accounts'){const accounts=await api('admin_accounts',{accessKey:session.key});body=`<section class="card"><h2>BOSS-аккаунты</h2><form id="boss-form" class="boss-form"><input id="boss-name" class="input" placeholder="Имя или участок" maxlength="80" required><button class="button">Создать аккаунт</button></form><div class="account-list">${accounts.length?accounts.map(a=>`<article class="account"><div class="account-name">${esc(a.name)}</div><div class="account-key">${esc(a.key)}</div><div class="icon-actions"><button class="mini" data-copy="${esc(a.key)}">Копировать</button><button class="mini" data-rotate="${a.id}">Новый ключ</button><button class="mini danger" data-delete="${a.id}" data-name="${esc(a.name)}">Удалить</button></div></article>`).join(''):'<p class="muted">Аккаунтов пока нет</p>'}</div></section>`}
      if(adminTab==='history'){const history=await api('admin_history',{accessKey:session.key,limit:100});body=`<section class="card history"><h2>Последние 100 вызовов</h2><table><thead><tr><th>Время</th><th>Этаж</th><th>Статус</th><th>Источник</th></tr></thead><tbody>${history.map(row=>`<tr><td>${time(row.created_at)}</td><td><strong>${row.floor}</strong></td><td>${esc(statusLabel[row.status]||row.status)}</td><td>${row.source==='boss'?'<span class="badge boss">BOSS</span> '+esc(row.source_name||''):'Рабочий'}</td></tr>`).join('')}</tbody></table></section>`}
      if(adminTab==='qr'){const qrs=await api('admin_qrs',{accessKey:session.key});await loadQr();const base=new URL('./w.html',location.href).href.split('?')[0];body=`<section class="card qr-print"><div class="screen-head no-print"><div><h2>QR-коды этажей</h2><p class="muted">Крупный стандартный QR для камеры iPhone. Старые QR перестанут работать после пересоздания.</p></div><div class="actions"><button id="print-qrs" class="button secondary">Печать всех QR</button><button id="rotate-qrs" class="button danger">Пересоздать все семь QR</button></div></div><div class="qr-grid">${qrs.map(q=>{const url=base+'?f='+q.floor+'&t='+encodeURIComponent(q.token);return`<article class="qr-card"><h3>Этаж ${q.floor}</h3>${qrSvg(url)}<div class="qr-url">${esc(url)}</div></article>`}).join('')}</div></section>`}
      app.innerHTML=`${screenHead('Администратор','Управление BOP MASTER Lift',dashboard.available)}${adminTabs()}${body}`;
      bindAdmin(dashboard);
    }catch(e){if(e.status!==401&&!silent)toast('Не удалось обновить данные')}finally{adminLoading=false}
  }
  function bindAdmin(dashboard){
    document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{adminTab=button.dataset.tab;renderAdmin()});
    const copyOperator=document.getElementById('copy-operator');if(copyOperator)copyOperator.onclick=()=>copy(dashboard.operator_key);
    const rotateOperator=document.getElementById('rotate-operator');if(rotateOperator)rotateOperator.onclick=async()=>{if(confirm('Создать новый ключ? Старая сессия лифтёра сразу отключится.')){const key=await api('admin_rotate_operator',{accessKey:session.key});await copy(key);renderAdmin()}};
    const bossForm=document.getElementById('boss-form');if(bossForm)bossForm.onsubmit=async event=>{event.preventDefault();const name=document.getElementById('boss-name').value.trim();if(!name)return;const account=await api('admin_create_boss',{accessKey:session.key,name});await copy(account.key);renderAdmin()};
    document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=()=>copy(button.dataset.copy));
    document.querySelectorAll('[data-rotate]').forEach(button=>button.onclick=async()=>{if(confirm('Обновить ключ этого BOSS? Старая сессия отключится.')){const key=await api('admin_rotate_boss',{accessKey:session.key,bossId:Number(button.dataset.rotate)});await copy(key);renderAdmin()}});
    document.querySelectorAll('[data-delete]').forEach(button=>button.onclick=async()=>{if(confirm('Удалить аккаунт «'+button.dataset.name+'»?')){await api('admin_delete_boss',{accessKey:session.key,bossId:Number(button.dataset.delete)});renderAdmin()}});
    const print=document.getElementById('print-qrs');if(print)print.onclick=()=>window.print();
    const rotateQr=document.getElementById('rotate-qrs');if(rotateQr)rotateQr.onclick=async()=>{if(!confirm('Пересоздать все 7 QR? Все распечатанные старые QR сразу перестанут работать.'))return;rotateQr.disabled=true;rotateQr.textContent='Пересоздаём…';try{await api('admin_rotate_qrs',{accessKey:session.key});toast('Готово: все 7 QR пересозданы');await renderAdmin()}catch(e){if(e.status!==401)toast('Не удалось пересоздать QR')}finally{rotateQr.disabled=false;rotateQr.textContent='Пересоздать все семь QR'}};
  }
  function loadQr(){if(window.qrcode)return Promise.resolve();if(qrLoader)return qrLoader;qrLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./qrcode.js?v=20260903.4';script.onload=()=>window.qrcode?resolve():reject(new Error('qr_loader_failed'));script.onerror=reject;document.head.append(script)});return qrLoader}
  function qrSvg(url){const code=window.qrcode(0,'M');code.addData(url,'Byte');code.make();return code.createSvgTag({cellSize:8,margin:32,scalable:true,alt:'QR-код вызова лифта'})}
  async function act(action,data,message){try{const result=await api(action,data);if(message)toast(message);return result}catch(e){if(e.status!==401)toast(e.message.includes('operator_unavailable')?'Лифтёр не на месте':'Действие не выполнено');throw e}}
  function start(){
    stopPoll();logoutButton.classList.remove('hidden');app.innerHTML='<div class="loading">Загрузка…</div>';
    const render=session.access==='operator'?renderOperator:session.access==='boss'?renderBoss:renderAdmin;
    render();pollTimer=setInterval(()=>{if(!document.hidden&&!(session.access==='admin'&&adminTab!=='overview'))render(true)},session.access==='admin'?5000:3000);
  }
  logoutButton.onclick=()=>{knownCalls=null;saveSession(null);renderLogin()};
  document.addEventListener('pointerdown',()=>{if(session?.access==='operator')primeSound()},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)start()});
  addEventListener('online',()=>{if(session)start()});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=20260903.4',{updateViaCache:'none'}).catch(()=>{});
  session?start():renderLogin();
})();
